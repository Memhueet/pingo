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
    pub address_color: String,
    pub theme_id: String,
    /// 实时图表显示的时间窗口（秒）
    #[serde(default = "default_chart_window_seconds")]
    pub chart_window_seconds: u64,
    /// 连续失败 6 次后逐档采用的退避间隔（秒），最后一档封顶
    #[serde(default = "default_backoff_intervals")]
    pub backoff_intervals: Vec<u64>,
}

pub fn default_backoff_intervals() -> Vec<u64> {
    vec![10, 60, 180, 600, 1800, 3600]
}

pub fn default_chart_window_seconds() -> u64 {
    3600
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
            address_color: String::new(),
            theme_id: "pure-white".to_string(),
            chart_window_seconds: default_chart_window_seconds(),
            backoff_intervals: default_backoff_intervals(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub id: Uuid,
    pub address: String,
    pub alias: String,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewTarget {
    pub address: String,
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

/// 全历史统计计数器；前端按相同语义增量维护（stats.ts applySampleToStats）
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FullStats {
    pub total_count: u64,
    pub success_count: u64,
    pub latency_sum: f64,
    pub latency_max: f64,
    pub timeout_count: u64,
    /// "忽略单次超时"口径：被非超时样本确认的连续 ≥2 超时 run 之和
    pub filtered_timeout_count: u64,
    /// 尾部未确认的超时 run 长度；随基线下发以延续状态机
    pub pending_timeout_run: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TargetStatsEntry {
    pub target_id: Uuid,
    pub stats: FullStats,
}

/// 统计状态机推进一条样本：timeout 进入 pending run；
/// 非 timeout（成功或错误）时 run ≥2 整段计入 filtered；
/// 尾部未确认的 run 不计入，由 pending_timeout_run 带到下一次推进
pub fn apply_sample_to_stats(
    stats: &mut FullStats,
    status: &PingStatus,
    latency_ms: Option<f64>,
) {
    stats.total_count += 1;
    match status {
        PingStatus::Timeout => {
            stats.pending_timeout_run += 1;
            stats.timeout_count += 1;
        }
        other => {
            if stats.pending_timeout_run >= 2 {
                stats.filtered_timeout_count += stats.pending_timeout_run;
            }
            stats.pending_timeout_run = 0;
            if let (PingStatus::Success, Some(latency)) = (other, latency_ms) {
                stats.success_count += 1;
                stats.latency_sum += latency;
                stats.latency_max = stats.latency_max.max(latency);
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub settings: AppSettings,
    pub targets: Vec<Target>,
    pub target_stats: Vec<TargetStatsEntry>,
    pub ping_running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryFilePayload {
    pub path: String,
    pub targets: Vec<Target>,
    pub target_stats: Vec<TargetStatsEntry>,
}

/// 接受 IPv4/IPv6 字面量；zone index（如 fe80::1%eth0）显式拒绝
pub fn is_valid_address(value: &str) -> bool {
    if value.contains('%') {
        return false;
    }
    value.parse::<std::net::IpAddr>().is_ok()
}

/// `#RRGGBB`（大小写不敏感，# 可省略）→ Windows COLORREF（0x00BBGGRR）
pub fn parse_colorref(hex: &str) -> Option<u32> {
    let hex = hex.strip_prefix('#').unwrap_or(hex);
    if hex.len() != 6 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    let value = u32::from_str_radix(hex, 16).ok()?;
    let (r, g, b) = ((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
    Some((b << 16) | (g << 8) | r)
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
    fn parse_colorref_accepts_theme_hex_and_converts_byte_order() {
        // COLORREF 字节序为 0x00BBGGRR，与 #RRGGBB 相反
        assert_eq!(parse_colorref("#e0e5ec"), Some(0x00ec_e5_e0));
        assert_eq!(parse_colorref("1E293B"), Some(0x003b_29_1e));
        assert_eq!(parse_colorref("#000000"), Some(0));
        assert_eq!(parse_colorref("#FFFFFF"), Some(0x00ff_ff_ff));
    }

    #[test]
    fn parse_colorref_rejects_garbage() {
        assert_eq!(parse_colorref(""), None);
        assert_eq!(parse_colorref("#e0e5"), None);
        assert_eq!(parse_colorref("#e0e5ecff"), None);
        assert_eq!(parse_colorref("#e0e5eg"), None);
        assert_eq!(parse_colorref("纯色"), None);
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
    fn target_accepts_ipv4_and_ipv6_literals() {
        // IPv4
        assert!(is_valid_address("192.168.1.1"));
        assert!(!is_valid_address("300.1.1.1"));
        // IPv6 压缩/完整/内嵌 IPv4
        assert!(is_valid_address("2001:db8::1"));
        assert!(is_valid_address("::1"));
        assert!(is_valid_address("::ffff:192.168.1.1"));
        // 拒绝：域名、双压缩、zone index
        assert!(!is_valid_address("example.com"));
        assert!(!is_valid_address("1::2::3"));
        assert!(!is_valid_address("fe80::1%eth0"));
    }

    #[test]
    fn bootstrap_payload_includes_ping_running() {
        let payload = BootstrapPayload {
            settings: AppSettings::default(),
            targets: vec![],
            target_stats: vec![],
            ping_running: false,
        };
        assert!(!payload.ping_running);
    }
}
