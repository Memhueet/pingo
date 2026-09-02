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
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ping_interval_seconds: 5,
            ping_timeout_seconds: 5,
            retention_days: 7,
            alert_threshold: 3,
            alias_color: "#1f2933".to_string(),
            ipv4_color: "#6b7280".to_string(),
            theme_id: "pure-white".to_string(),
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
