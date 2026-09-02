use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::models::*;
use crate::ping;
use crate::storage::Storage;

#[derive(Debug, Clone, PartialEq, Eq)]
enum LastReportedStatus {
    None,
    Success,
    Timeout,
    Error,
}

pub struct TargetPingState {
    consecutive_timeouts: u32,
    last_ping_time: Option<chrono::DateTime<Utc>>,
    last_reported_status: LastReportedStatus,
    last_alerting: bool,
}

impl Default for TargetPingState {
    fn default() -> Self {
        Self {
            consecutive_timeouts: 0,
            last_ping_time: None,
            last_reported_status: LastReportedStatus::None,
            last_alerting: false,
        }
    }
}

/// 连续失败 1-5 次按正常间隔；第 6 次起按用户配置的退避阶梯逐档放慢，最后一档封顶
fn get_backoff_interval(consecutive_timeouts: u32, intervals: &[u64]) -> u64 {
    if consecutive_timeouts <= 5 {
        5
    } else {
        let index = (consecutive_timeouts as usize - 6).min(intervals.len() - 1);
        intervals[index]
    }
}

pub struct SchedulerState {
    pub ping_running: AtomicBool,
    pub scheduler_started: AtomicBool,
    pub interval_seconds: Mutex<u64>,
    pub timeout_seconds: Mutex<u64>,
    pub alert_threshold: Mutex<u32>,
    pub backoff_intervals: Mutex<Vec<u64>>,
    pub target_states: Mutex<HashMap<Uuid, TargetPingState>>,
    pub data_path: Mutex<String>,
}

impl SchedulerState {
    pub fn new(settings: &AppSettings, data_path: String) -> Self {
        Self {
            ping_running: AtomicBool::new(false),
            scheduler_started: AtomicBool::new(false),
            interval_seconds: Mutex::new(settings.ping_interval_seconds),
            timeout_seconds: Mutex::new(settings.ping_timeout_seconds),
            alert_threshold: Mutex::new(settings.alert_threshold),
            backoff_intervals: Mutex::new(settings.backoff_intervals.clone()),
            target_states: Mutex::new(HashMap::new()),
            data_path: Mutex::new(data_path),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingSampleEvent {
    pub sample: PingSample,
    pub alerting: bool,
    pub notify: bool,
    pub notify_alerting: bool,
}

pub fn start(
    app_handle: AppHandle,
    state: Arc<SchedulerState>,
) {
    tokio::spawn(async move {
        loop {
            if !state.ping_running.load(Ordering::Acquire) {
                tokio::time::sleep(Duration::from_millis(200)).await;
                continue;
            }

            let base_interval = *state.interval_seconds.lock().await;
            let backoff_intervals = state.backoff_intervals.lock().await.clone();
            let data_path = state.data_path.lock().await.clone();

            let storage = match Storage::open(data_path) {
                Ok(s) => s,
                Err(_) => continue,
            };

            let targets = storage
                .list_targets()
                .unwrap_or_default()
                .into_iter()
                .filter(|t| t.enabled)
                .collect::<Vec<_>>();

            let now = Utc::now();
            let mut target_states = state.target_states.lock().await;

            for target in &targets {
                let target_state = target_states.entry(target.id).or_insert_with(Default::default);

                let should_ping = if let Some(last_ping) = target_state.last_ping_time {
                    // 退避档位不得小于正常探测间隔，避免异常配置反而加密探测
                    let interval =
                        get_backoff_interval(target_state.consecutive_timeouts, &backoff_intervals)
                            .max(base_interval);
                    (now - last_ping).num_seconds() >= interval as i64
                } else {
                    true
                };

                if !should_ping {
                    continue;
                }

                target_state.last_ping_time = Some(now);
                let timeout = *state.timeout_seconds.lock().await;
                let result = ping::ping_target(&target.ipv4, timeout).await;
                let timeout_fload: f64 = timeout as f64;

                let (status, latency_ms, error_kind) = match result {
                    Ok(ping::ParsedPing::Success { latency_ms }) => {
                        (PingStatus::Success, Some(latency_ms), None)
                    }
                    Ok(ping::ParsedPing::Timeout) => (PingStatus::Timeout, Some(timeout_fload), None),
                    Ok(ping::ParsedPing::Error { kind }) => {
                        (PingStatus::Error, None, Some(kind))
                    }
                    Err(e) => (PingStatus::Error, None, Some(e.kind.clone())),
                };

                let sample = PingSample {
                    id: Uuid::new_v4(),
                    target_id: target.id,
                    sent_at: now,
                    status,
                    latency_ms,
                    error_kind,
                };

                let _ = storage.insert_sample(&sample);
                if let Ok(settings) = storage.get_settings() {
                    let _ = storage.cleanup_retention(settings.retention_days);
                }

                let threshold = *state.alert_threshold.lock().await;
                let (alerting, notify, notify_alerting) = match sample.status {
                    PingStatus::Timeout | PingStatus::Error => {
                        target_state.consecutive_timeouts += 1;
                        let new_reported = if sample.status == PingStatus::Timeout {
                            LastReportedStatus::Timeout
                        } else {
                            LastReportedStatus::Error
                        };
                        let should_notify = target_state.last_reported_status != new_reported;
                        target_state.last_reported_status = new_reported;
                        let is_alerting = target_state.consecutive_timeouts >= threshold;
                        let should_notify_alerting = is_alerting && !target_state.last_alerting;
                        target_state.last_alerting = is_alerting;
                        (is_alerting, should_notify, should_notify_alerting)
                    }
                    PingStatus::Success => {
                        let should_notify = target_state.last_reported_status != LastReportedStatus::Success &&
                                          target_state.last_reported_status != LastReportedStatus::None;
                        let was_alerting = target_state.last_alerting;
                        target_state.consecutive_timeouts = 0;
                        target_state.last_reported_status = LastReportedStatus::Success;
                        target_state.last_alerting = false;
                        (false, should_notify, was_alerting)
                    }
                };

                let _ = app_handle.emit(
                    "ping-sample",
                    PingSampleEvent {
                        sample,
                        alerting,
                        notify,
                        notify_alerting,
                    },
                );
            }

            drop(target_states);
            tokio::time::sleep(Duration::from_secs(base_interval)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const LADDER: [u64; 6] = [10, 60, 180, 600, 1800, 3600];

    #[test]
    fn backoff_uses_normal_interval_before_sixth_failure() {
        for ct in 0..=5 {
            assert_eq!(get_backoff_interval(ct, &LADDER), 5);
        }
    }

    #[test]
    fn backoff_escalates_through_configured_ladder() {
        assert_eq!(get_backoff_interval(6, &LADDER), 10);
        assert_eq!(get_backoff_interval(7, &LADDER), 60);
        assert_eq!(get_backoff_interval(10, &LADDER), 1800);
        assert_eq!(get_backoff_interval(11, &LADDER), 3600);
    }

    #[test]
    fn backoff_caps_at_last_ladder_step() {
        assert_eq!(get_backoff_interval(100, &LADDER), 3600);
    }

    #[test]
    fn backoff_works_with_custom_ladder_length() {
        assert_eq!(get_backoff_interval(7, &[30, 120]), 120);
        assert_eq!(get_backoff_interval(50, &[30, 120]), 120);
    }
}
