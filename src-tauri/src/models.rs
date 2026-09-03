use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub ping_interval_seconds: u64,
    pub ping_timeout_seconds: u64,
    pub retention_days: i64,
    pub alert_threshold: u32,
    pub alias_color: String,
    pub ipv4_color: String,
    pub theme_id: String,
    /// 连续失败 6 次后逐档采用的退避间隔（秒），最后一档封顶
    #[serde(default = "default_backoff_intervals")]
    pub backoff_intervals: Vec<u64>,
}

pub fn default_backoff_intervals() -> Vec<u64> {
    vec![10, 60, 180, 600, 1800, 3600]
}

/// 解析逗号分隔的退避阶梯；跳过无法解析的项，不足 6 档用默认值补齐，超出 6 档截断
pub fn parse_backoff_intervals(raw: &str) -> Vec<u64> {
    let defaults = default_backoff_intervals();
    let mut out: Vec<u64> = raw
        .split(',')
        .filter_map(|part| part.trim().parse::<u64>().ok())
        .take(defaults.len())
        .collect();
    while out.len() < defaults.len() {
        out.push(defaults[out.len()]);
    }
    out
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ping_interval_seconds: 5,
            ping_timeout_seconds: 5,
            retention_days: 7,
            alert_threshold: 3,
            // 空字符串 = 别名/IP 文字颜色跟随当前主题
            alias_color: String::new(),
            ipv4_color: String::new(),
            theme_id: "pure-white".to_string(),
            backoff_intervals: default_backoff_intervals(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub id: Uuid,
    pub ipv4: String,
    pub alias: String,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewTarget {
    pub ipv4: String,
    pub alias: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PingStatus {
    Success,
    Timeout,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PingSample {
    pub id: Uuid,
    pub target_id: Uuid,
    pub sent_at: DateTime<Utc>,
    pub status: PingStatus,
    pub latency_ms: Option<f64>,
    pub error_kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub settings: AppSettings,
    pub targets: Vec<Target>,
    pub ping_running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryFilePayload {
    pub path: String,
    pub targets: Vec<Target>,
}

pub fn is_valid_ipv4(value: &str) -> bool {
    value.parse::<std::net::Ipv4Addr>().is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_match_spec() {
        let settings = AppSettings::default();
        assert_eq!(settings.ping_interval_seconds, 5);
        assert_eq!(settings.ping_timeout_seconds, 5);
        assert_eq!(settings.retention_days, 7);
        assert_eq!(settings.alert_threshold, 3);
        assert_eq!(settings.backoff_intervals, vec![10, 60, 180, 600, 1800, 3600]);
    }

    #[test]
    fn parse_backoff_intervals_handles_garbage_and_padding() {
        assert_eq!(
            parse_backoff_intervals("15,90,300,900,2700,7200"),
            vec![15, 90, 300, 900, 2700, 7200]
        );
        // 无法解析的项被跳过，缺失的档位按默认值补齐
        assert_eq!(
            parse_backoff_intervals("abc,60,,600"),
            vec![60, 600, 180, 600, 1800, 3600]
        );
        assert_eq!(
            parse_backoff_intervals(""),
            vec![10, 60, 180, 600, 1800, 3600]
        );
        // 超出 6 档截断
        assert_eq!(
            parse_backoff_intervals("1,2,3,4,5,6,7,8"),
            vec![1, 2, 3, 4, 5, 6]
        );
    }

    #[test]
    fn target_requires_ipv4_shape() {
        assert!(is_valid_ipv4("192.168.1.1"));
        assert!(!is_valid_ipv4("example.com"));
        assert!(!is_valid_ipv4("2001:db8::1"));
        assert!(!is_valid_ipv4("300.1.1.1"));
    }

    #[test]
    fn bootstrap_payload_includes_ping_running() {
        let payload = BootstrapPayload {
            settings: AppSettings::default(),
            targets: vec![],
            ping_running: false,
        };
        assert!(!payload.ping_running);
    }
}
