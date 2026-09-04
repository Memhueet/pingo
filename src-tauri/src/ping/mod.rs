/// 三态探测结果：成功（含延迟）/ 超时 / 其他错误。
/// Windows 原生 ICMP 与 Unix 系统 ping 两条路径共用。
#[derive(Debug, Clone, PartialEq)]
pub enum ParsedPing {
    Success { latency_ms: f64 },
    Timeout,
    Error { kind: String },
}

impl ParsedPing {
    pub fn success(latency_ms: f64) -> Self {
        Self::Success { latency_ms }
    }

    pub fn timeout() -> Self {
        Self::Timeout
    }
}

#[cfg(unix)]
pub mod parser;

#[cfg(unix)]
pub mod command;

#[cfg(windows)]
mod icmp;

#[cfg(windows)]
pub use icmp::probe;
#[cfg(not(windows))]
pub use command::ping_target as probe;

/// Windows ICMP API 返回的 IP_STATUS → 统一探测结果。
/// 独立成纯函数放在跨平台模块，便于在任意平台单测。
pub fn map_ip_status(status: u32, rtt_ms: u32) -> ParsedPing {
    match status {
        0 => ParsedPing::success(rtt_ms as f64), // IP_SUCCESS
        11010 => ParsedPing::timeout(),          // IP_REQ_TIMED_OUT
        other => ParsedPing::Error { kind: format!("ipStatus{other}") },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ip_status_maps_to_parsed_ping() {
        assert_eq!(map_ip_status(0, 12), ParsedPing::success(12.0));
        // RTT <1ms 时 API 回报 0，保留 0.0
        assert_eq!(map_ip_status(0, 0), ParsedPing::success(0.0));
        assert_eq!(map_ip_status(11010, 0), ParsedPing::timeout());
        assert_eq!(
            map_ip_status(11002, 0),
            ParsedPing::Error { kind: "ipStatus11002".to_string() }
        );
    }
}
