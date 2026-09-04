use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;

use super::parser::parse_ping_output;
use super::ParsedPing;
use crate::error::{AppError, CommandResult};

/// macOS 的 ping 仅支持 IPv4，IPv6 字面量必须走 ping6；
/// Linux 的 ping 两族通吃，无需区分。
#[cfg(target_os = "macos")]
fn ping_program(address: &str) -> &'static str {
    if address.contains(':') {
        "ping6"
    } else {
        "ping"
    }
}

#[cfg(not(target_os = "macos"))]
fn ping_program(_address: &str) -> &'static str {
    "ping"
}

/// 组装系统 ping 参数。等待超时的单位按平台区分：
/// macOS `-W` 为毫秒，Linux `-W` 为秒。
/// macOS 的 ping6 没有 `-W` 等待选项（`-W`/`-w` 是 Node-Info 查询标志，
/// 不接参数），IPv6 的等待上限由 ping_target 的应用层超时兜底。
#[cfg(target_os = "macos")]
fn build_ping_args(address: &str, timeout_secs: u64) -> Vec<String> {
    if address.contains(':') {
        vec!["-c".into(), "1".into(), address.into()]
    } else {
        vec![
            "-c".into(),
            "1".into(),
            "-W".into(),
            (timeout_secs * 1000).to_string(),
            address.into(),
        ]
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn build_ping_args(address: &str, timeout_secs: u64) -> Vec<String> {
    vec![
        "-c".into(),
        "1".into(),
        "-W".into(),
        timeout_secs.to_string(),
        address.into(),
    ]
}

pub async fn ping_target(address: &str, timeout_secs: u64) -> CommandResult<ParsedPing> {
    let mut cmd = Command::new(ping_program(address));
    cmd.args(build_ping_args(address, timeout_secs));

    let child = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| AppError::PingCommand(e.to_string()))?;

    // 应用层统一掐断等待上限：带 -W 的平台 ping 本应在此之前自行退出，
    // ping6 到期则由 kill_on_drop 终止进程并计为超时。
    match tokio::time::timeout(Duration::from_secs(timeout_secs), child.wait_with_output()).await {
        Ok(output) => {
            let output = output.map_err(|e| AppError::PingCommand(e.to_string()))?;
            Ok(parse_ping_output(&String::from_utf8_lossy(&output.stdout)))
        }
        Err(_) => Ok(ParsedPing::timeout()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn ping_localhost_succeeds() {
        let result = ping_target("127.0.0.1", 5).await;
        assert!(result.is_ok());
        match result.unwrap() {
            ParsedPing::Success { .. } => {}
            other => panic!("expected Success, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn ping_loopback_timeout_is_safe() {
        let result = ping_target("10.0.0.250", 2).await;
        assert!(result.is_ok());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_ping_args_use_millisecond_wait() {
        assert_eq!(
            build_ping_args("127.0.0.1", 5),
            vec!["-c".to_string(), "1".to_string(), "-W".to_string(), "5000".to_string(), "127.0.0.1".to_string()]
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_ipv6_targets_use_ping6_without_wait_flag() {
        assert_eq!(ping_program("2001:db8::1"), "ping6");
        assert_eq!(ping_program("127.0.0.1"), "ping");
        // ping6 无 -W 等待选项，等待上限由应用层超时兜底
        assert_eq!(
            build_ping_args("2001:db8::1", 5),
            vec!["-c".to_string(), "1".to_string(), "2001:db8::1".to_string()]
        );
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn ping6_loopback_succeeds() {
        let result = ping_target("::1", 5).await;
        assert!(result.is_ok());
        match result.unwrap() {
            ParsedPing::Success { .. } => {}
            other => panic!("expected Success, got {:?}", other),
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn linux_ping_args_use_second_wait() {
        assert_eq!(
            build_ping_args("127.0.0.1", 5),
            vec!["-c".to_string(), "1".to_string(), "-W".to_string(), "5".to_string(), "127.0.0.1".to_string()]
        );
        assert_eq!(ping_program("::1"), "ping");
    }
}
