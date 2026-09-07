use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;

use chrono::{DateTime, Utc};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, Notify};
use tokio::task::JoinSet;
use uuid::Uuid;

use crate::error::CommandResult;
use crate::models::*;
use crate::ping;
use crate::storage::Storage;

pub struct TargetPingState {
    consecutive_timeouts: u32,
    last_ping_time: Option<chrono::DateTime<Utc>>,
    last_alerting: bool,
}

impl TargetPingState {
    /// 失败样本：推进连续失败计数。返回是否"刚跨过阈值进入告警"（每次告警沿仅一次）；
    /// 未达阈值的失败与失败类型切换一律静默
    fn observe_failure(&mut self, threshold: u32) -> bool {
        self.consecutive_timeouts += 1;
        let is_alerting = self.consecutive_timeouts >= threshold;
        let notify_alerting = is_alerting && !self.last_alerting;
        self.last_alerting = is_alerting;
        notify_alerting
    }

    /// 成功样本：失败计数归零。仅当此前处于告警中才返回真（"连线恢复"），
    /// 未告警的偶发失败恢复保持静默
    fn observe_success(&mut self) -> bool {
        let notify_recovery = self.last_alerting;
        self.consecutive_timeouts = 0;
        self.last_alerting = false;
        notify_recovery
    }
}

impl Default for TargetPingState {
    fn default() -> Self {
        Self {
            consecutive_timeouts: 0,
            last_ping_time: None,
            last_alerting: false,
        }
    }
}

/// 连续失败 1-5 次按正常间隔；第 6 次起按用户配置的退避阶梯逐档放慢，最后一档封顶
fn get_backoff_interval(consecutive_timeouts: u32, base_interval: u64, intervals: &[u64]) -> u64 {
    if consecutive_timeouts <= 5 {
        base_interval
    } else {
        let index = (consecutive_timeouts as usize - 6).min(intervals.len() - 1);
        intervals[index]
    }
}

/// 距上次探测的间隔达到当前退避档位（且不小于正常采样间隔）即视为到期
fn is_due(
    last_ping: DateTime<Utc>,
    consecutive_timeouts: u32,
    base_interval: u64,
    backoff_intervals: &[u64],
    now: DateTime<Utc>,
) -> bool {
    let interval = get_backoff_interval(consecutive_timeouts, base_interval, backoff_intervals)
        .max(base_interval);
    (now - last_ping).num_seconds() >= interval as i64
}

/// 未在途目标中最早的下次到期时刻，作为采样循环的睡眠终点；
/// 新目标（无 last_ping_time）由派发步骤立即发出，不参与此计算
fn earliest_dispatch(
    target_ids: &[Uuid],
    states: &HashMap<Uuid, TargetPingState>,
    in_flight: &HashSet<Uuid>,
    base_interval: u64,
    backoff_intervals: &[u64],
) -> Option<DateTime<Utc>> {
    target_ids
        .iter()
        .filter(|id| !in_flight.contains(*id))
        .filter_map(|id| {
            states.get(id).and_then(|ts| {
                ts.last_ping_time.map(|last| {
                    let due = get_backoff_interval(
                        ts.consecutive_timeouts,
                        base_interval,
                        backoff_intervals,
                    )
                    .max(base_interval);
                    last + chrono::Duration::seconds(due as i64)
                })
            })
        })
        .min()
}

/// 保留策略清理每小时最多执行一次；从未清理过（含启动首轮）立即执行
fn should_cleanup(last: Option<DateTime<Utc>>, now: DateTime<Utc>) -> bool {
    match last {
        Some(t) => (now - t) >= chrono::Duration::hours(1),
        None => true,
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
    /// 上次保留策略清理时间；None 表示启动后尚未清理过
    pub last_cleanup: Mutex<Option<DateTime<Utc>>>,
    /// 设置/目标/启停/数据文件变更后 notify_one，唤醒采样循环立即重排
    pub reschedule_notify: Notify,
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
            last_cleanup: Mutex::new(None),
            reschedule_notify: Notify::new(),
        }
    }

    /// 任何影响调度的变更之后调用，采样循环立即重排，而非等到下一个到期时点才生效
    pub fn request_reschedule(&self) {
        self.reschedule_notify.notify_one();
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingSampleEvent {
    pub sample: PingSample,
    /// 目标当前是否处于告警（连续失败 ≥ 阈值）
    pub alerting: bool,
    /// 连线恢复通知：仅当此前处于告警中又恢复成功时为真
    pub notify: bool,
    /// 刚跨过阈值进入告警的那一刻为真（每次告警沿只发一次）
    pub notify_alerting: bool,
}

/// 一次探测的派发记录；sent_at/timeout 在派发时刻定格，保证样本时间轴与口径一致
struct ProbeJob {
    target_id: Uuid,
    address: String,
    timeout_secs: u64,
    sent_at: DateTime<Utc>,
}

type ProbeOutcome = (ProbeJob, CommandResult<ping::ParsedPing>);

pub fn start(app_handle: AppHandle, state: Arc<SchedulerState>) {
    tokio::spawn(sampling_loop(app_handle, state.clone()));
    tokio::spawn(retention_loop(state));
}

/// 采样循环：每目标独立节奏，事件驱动不空转。
/// 到期即派发、完成即处理，慢目标（如等满超时的丢包目标）不会拖累其他目标的间隔。
async fn sampling_loop(app_handle: AppHandle, state: Arc<SchedulerState>) {
    let mut probe_set: JoinSet<ProbeOutcome> = JoinSet::new();
    let mut in_flight: HashSet<Uuid> = HashSet::new();
    // 连接随任务常驻，避免每轮开关；数据文件切换时按路径变化重开。
    // rusqlite 连接非 Sync（&Storage 不满足 Send），包一层 std Mutex 仅为可跨 await 持有；
    // 该连接仅本任务访问，无实际争用。
    let mut storage: Option<Arc<StdMutex<Storage>>> = None;
    let mut storage_path = String::new();
    let mut open_failure_logged = false;

    loop {
        if !state.ping_running.load(Ordering::Acquire) {
            // 暂停中：只收尾在途探测并等待恢复通知
            tokio::select! {
                Some(outcome) = probe_set.join_next() => {
                    process_outcome(outcome, storage.as_ref(), &state, &app_handle, &mut in_flight)
                        .await;
                }
                _ = state.reschedule_notify.notified() => {}
            }
            continue;
        }

        let base_interval = *state.interval_seconds.lock().await;
        let backoff_intervals = state.backoff_intervals.lock().await.clone();
        let timeout_secs = *state.timeout_seconds.lock().await;

        let data_path = state.data_path.lock().await.clone();
        if storage.is_none() || storage_path != data_path {
            match Storage::open(&data_path) {
                Ok(s) => {
                    storage = Some(Arc::new(StdMutex::new(s)));
                    storage_path = data_path;
                    open_failure_logged = false;
                }
                Err(e) => {
                    storage = None;
                    if !open_failure_logged {
                        eprintln!("打开数据文件失败，采样暂停: {e}");
                        open_failure_logged = true;
                    }
                }
            }
        }

        let mut enabled_ids: Vec<Uuid> = Vec::new();
        if let Some(storage) = storage.as_ref() {
            let targets = storage.lock().unwrap().list_targets().unwrap_or_default();
            enabled_ids = targets.iter().filter(|t| t.enabled).map(|t| t.id).collect();
            let now = Utc::now();

            // 派发：到期且不在途的目标立即发出；last_ping_time 即实际派发时刻
            let mut states = state.target_states.lock().await;
            for target in targets.iter().filter(|t| t.enabled) {
                let due = {
                    let ts = states.entry(target.id).or_default();
                    let expired = match ts.last_ping_time {
                        Some(last) => is_due(
                            last,
                            ts.consecutive_timeouts,
                            base_interval,
                            &backoff_intervals,
                            now,
                        ),
                        None => true,
                    };
                    if expired {
                        ts.last_ping_time = Some(now);
                    }
                    expired
                };
                if due && !in_flight.contains(&target.id) {
                    in_flight.insert(target.id);
                    let job = ProbeJob {
                        target_id: target.id,
                        address: target.address.clone(),
                        timeout_secs,
                        sent_at: now,
                    };
                    probe_set.spawn(async move {
                        let result = ping::probe(&job.address, job.timeout_secs).await;
                        (job, result)
                    });
                }
            }
        }

        // 睡到最早到期目标；无目标时按间隔空巡，打不开数据文件时 200ms 重试
        let wake_delay = {
            let states = state.target_states.lock().await;
            match earliest_dispatch(&enabled_ids, &states, &in_flight, base_interval, &backoff_intervals)
            {
                Some(at) => (at - Utc::now()).to_std().unwrap_or(Duration::ZERO),
                None => {
                    if storage.is_some() {
                        Duration::from_secs(base_interval.max(1))
                    } else {
                        Duration::from_millis(200)
                    }
                }
            }
        };
        tokio::select! {
            _ = tokio::time::sleep(wake_delay) => {}
            _ = state.reschedule_notify.notified() => {}
            Some(outcome) = probe_set.join_next() => {
                process_outcome(outcome, storage.as_ref(), &state, &app_handle, &mut in_flight)
                    .await;
            }
        }
    }
}

/// 处理单个完成的探测：落库、推进状态机并向前端发事件
async fn process_outcome(
    outcome: Result<ProbeOutcome, tokio::task::JoinError>,
    storage: Option<&Arc<StdMutex<Storage>>>,
    state: &SchedulerState,
    app_handle: &AppHandle,
    in_flight: &mut HashSet<Uuid>,
) {
    let (job, result) = match outcome {
        Ok(pair) => pair,
        // 探测任务异常（panic 兜底）：该目标会滞留在在途集合，不再采样。
        // ping 路径无 unwrap、实际不会 panic，仅记录日志便于诊断。
        Err(e) => {
            eprintln!("探测任务异常: {e}");
            return;
        }
    };
    in_flight.remove(&job.target_id);

    let (status, latency_ms, error_kind) = match result {
        Ok(ping::ParsedPing::Success { latency_ms }) => {
            (PingStatus::Success, Some(latency_ms), None)
        }
        Ok(ping::ParsedPing::Timeout) => (PingStatus::Timeout, Some(job.timeout_secs as f64), None),
        Ok(ping::ParsedPing::Error { kind }) => (PingStatus::Error, None, Some(kind)),
        Err(e) => (PingStatus::Error, None, Some(e.kind.clone())),
    };

    let sample = PingSample {
        id: Uuid::new_v4(),
        target_id: job.target_id,
        sent_at: job.sent_at,
        status,
        latency_ms,
        error_kind,
    };

    if let Some(storage) = storage {
        let storage = storage.lock().unwrap();
        if let Err(e) = storage.insert_sample(&sample) {
            eprintln!("写入采样失败: {e}");
        }
    }

                    let threshold = *state.alert_threshold.lock().await;
                    let (alerting, notify, notify_alerting) = {
                        let mut states = state.target_states.lock().await;
                        let ts = states.entry(job.target_id).or_default();
                        match sample.status {
                            PingStatus::Timeout | PingStatus::Error => {
                                (false, false, ts.observe_failure(threshold))
                            }
                            PingStatus::Success => (false, ts.observe_success(), false),
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

/// 保留策略清理：独立低频任务，最多每小时一次，不占用采样循环
async fn retention_loop(state: Arc<SchedulerState>) {
    loop {
        let now = Utc::now();
        let due = {
            let mut last_cleanup = state.last_cleanup.lock().await;
            if should_cleanup(*last_cleanup, now) {
                *last_cleanup = Some(now);
                true
            } else {
                false
            }
        };
        if due {
            let data_path = state.data_path.lock().await.clone();
            match Storage::open(&data_path) {
                Ok(storage) => match storage.get_settings() {
                    Ok(settings) => {
                        if let Err(e) = storage.cleanup_retention(settings.retention_days) {
                            eprintln!("历史数据清理失败: {e}");
                        }
                    }
                    Err(e) => eprintln!("读取设置失败，跳过历史数据清理: {e}"),
                },
                Err(e) => eprintln!("打开数据文件失败，跳过历史数据清理: {e}"),
            }
        }
        tokio::time::sleep(Duration::from_secs(60)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LADDER: [u64; 6] = [10, 60, 180, 600, 1800, 3600];

    #[test]
    fn backoff_uses_normal_interval_before_sixth_failure() {
        for ct in 0..=5 {
            assert_eq!(get_backoff_interval(ct, 5, &LADDER), 5);
        }
    }

    #[test]
    fn backoff_respects_base_interval_below_five_seconds() {
        // 用户把正常间隔调到 5 秒以下时，不得被写死下限拉长
        for ct in 0..=5 {
            assert_eq!(get_backoff_interval(ct, 3, &LADDER), 3);
        }
    }

    #[test]
    fn backoff_escalates_through_configured_ladder() {
        assert_eq!(get_backoff_interval(6, 5, &LADDER), 10);
        assert_eq!(get_backoff_interval(7, 5, &LADDER), 60);
        assert_eq!(get_backoff_interval(10, 5, &LADDER), 1800);
        assert_eq!(get_backoff_interval(11, 5, &LADDER), 3600);
    }

    #[test]
    fn backoff_caps_at_last_ladder_step() {
        assert_eq!(get_backoff_interval(100, 5, &LADDER), 3600);
    }

    #[test]
    fn backoff_works_with_custom_ladder_length() {
        assert_eq!(get_backoff_interval(7, 5, &[30, 120]), 120);
        assert_eq!(get_backoff_interval(50, 5, &[30, 120]), 120);
    }

    fn state_with(last_ping: Option<DateTime<Utc>>, consecutive_timeouts: u32) -> TargetPingState {
        TargetPingState {
            consecutive_timeouts,
            last_ping_time: last_ping,
            last_alerting: false,
        }
    }

    #[test]
    fn dispatch_time_is_last_send_plus_interval_per_target() {
        let now = Utc::now();
        let id = Uuid::new_v4();
        let mut states = HashMap::new();
        states.insert(id, state_with(Some(now), 0));
        // 按各自上次派发时刻 + 间隔到期，不叠加轮耗时
        assert_eq!(
            earliest_dispatch(&[id], &states, &HashSet::new(), 3, &LADDER),
            Some(now + chrono::Duration::seconds(3))
        );
    }

    #[test]
    fn in_flight_target_does_not_stall_others_wake_time() {
        // 慢目标（等满超时）在途时，不参与唤醒计算，其余目标按自身节奏到期
        let now = Utc::now();
        let slow = Uuid::new_v4();
        let healthy = Uuid::new_v4();
        let mut states = HashMap::new();
        states.insert(slow, state_with(Some(now), 0));
        states.insert(healthy, state_with(Some(now - chrono::Duration::seconds(1)), 0));
        let mut in_flight = HashSet::new();
        in_flight.insert(slow);
        assert_eq!(
            earliest_dispatch(&[slow, healthy], &states, &in_flight, 3, &LADDER),
            Some(now + chrono::Duration::seconds(2))
        );
    }

    #[test]
    fn dispatch_time_applies_backoff_ladder() {
        let now = Utc::now();
        let id = Uuid::new_v4();
        let mut states = HashMap::new();
        states.insert(id, state_with(Some(now), 6));
        assert_eq!(
            earliest_dispatch(&[id], &states, &HashSet::new(), 3, &LADDER),
            Some(now + chrono::Duration::seconds(10))
        );
    }

    #[test]
    fn dispatch_time_none_when_all_targets_in_flight() {
        let now = Utc::now();
        let id = Uuid::new_v4();
        let mut states = HashMap::new();
        states.insert(id, state_with(Some(now), 0));
        let mut in_flight = HashSet::new();
        in_flight.insert(id);
        assert_eq!(
            earliest_dispatch(&[id], &states, &in_flight, 3, &LADDER),
            None
        );
    }

    #[test]
    fn alerting_fires_once_at_threshold_then_recovery_notifies() {
        let mut state = TargetPingState::default();

        // 前两次失败未达阈值：完全静默
        assert!(!state.observe_failure(3));
        assert!(!state.observe_failure(3));

        // 第 3 次跨过阈值：告警沿只在这一刻为真
        assert!(state.observe_failure(3));
        assert!(!state.observe_failure(3));

        // 告警中的目标恢复上线：仅此时需要"连线恢复"通知
        assert!(state.observe_success());
        assert!(!state.observe_success());
    }

    #[test]
    fn single_timeout_blip_stays_silent() {
        let mut state = TargetPingState::default();
        // 单次偶发超时：不告警
        assert!(!state.observe_failure(3));
        // 未告警过的目标恢复：不发"连线恢复"
        assert!(!state.observe_success());
    }

    #[test]
    fn timeout_error_flapping_keeps_counting_without_notifications() {
        let mut state = TargetPingState::default();
        // 超时与错误类型交替同样推进连续失败计数，且类型切换不再单独通知
        assert!(!state.observe_failure(3));
        assert!(!state.observe_failure(3));
        assert!(state.observe_failure(3));
    }

    #[test]
    fn repeated_failures_after_alert_do_not_re_notify() {
        let mut state = TargetPingState::default();
        for _ in 0..5 {
            state.observe_failure(3);
        }
        // 持续超时不重复通知
        assert!(!state.observe_failure(3));
    }

    #[test]
    fn cleanup_runs_immediately_then_at_most_hourly() {
        let now = Utc::now();
        // 从未清理过（启动首轮）立即执行
        assert!(should_cleanup(None, now));
        // 一小时内不重复执行
        assert!(!should_cleanup(Some(now - chrono::Duration::minutes(30)), now));
        // 超过一小时再次执行
        assert!(should_cleanup(Some(now - chrono::Duration::hours(2)), now));
    }

    #[test]
    fn target_due_when_interval_elapsed_exactly() {
        let now = Utc::now();
        assert!(is_due(now - chrono::Duration::seconds(5), 0, 5, &LADDER, now));
    }

    #[test]
    fn target_not_due_before_interval() {
        let now = Utc::now();
        assert!(!is_due(now - chrono::Duration::seconds(4), 0, 5, &LADDER, now));
    }

    #[test]
    fn backoff_ladder_raises_due_bar() {
        let now = Utc::now();
        // 连续失败 6 次后档位为 10s，高于正常间隔 5s
        assert!(!is_due(now - chrono::Duration::seconds(5), 6, 5, &LADDER, now));
        assert!(is_due(now - chrono::Duration::seconds(10), 6, 5, &LADDER, now));
    }
}
