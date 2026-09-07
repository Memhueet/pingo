use std::net::Ipv4Addr;

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

/// Windows IcmpSendEcho 的 DestinationAddress（IPAddr）取 inet_addr() 返回的
/// "网络字节序" u32：指内存布局按地址顺序，按值传入时在小端机器上等于
/// 地址字节的反序数值（例：192.168.1.1 → 0x0101A8C0，与 inet_addr 一致）。
pub fn ipv4_dest_u32(addr: Ipv4Addr) -> u32 {
    u32::from_le_bytes(addr.octets())
}

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
    fn ipv4_dest_u32_matches_inet_addr_value() {
        // 期望值即 inet_addr() 的返回值（内存布局为地址顺序）
        assert_eq!(ipv4_dest_u32("192.168.1.1".parse().unwrap()), 0x0101_A8C0);
        assert_eq!(ipv4_dest_u32("127.0.0.1".parse().unwrap()), 0x0100_007F);
        assert_eq!(ipv4_dest_u32("1.2.3.4".parse().unwrap()), 0x0403_0201);
        assert_eq!(
            ipv4_dest_u32("255.255.255.255".parse().unwrap()),
            0xFFFF_FFFF
        );
    }

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
