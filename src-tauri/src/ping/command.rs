use std::process::Stdio;
use tokio::process::Command;

use super::parser::{parse_ping_output, ParsedPing};
use crate::error::{AppError, CommandResult};

use encoding_rs::GBK;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 组装系统 ping 参数。等待超时的单位按平台区分：
/// Windows `-w` 与 macOS `-W` 为毫秒，Linux `-W` 为秒。
#[cfg(target_os = "windows")]
fn build_ping_args(address: &str, timeout_secs: u64) -> Vec<String> {
    vec![
        "-n".into(),
        "1".into(),
        "-w".into(),
        (timeout_secs * 1000).to_string(),
        address.into(),
    ]
}

#[cfg(target_os = "macos")]
fn build_ping_args(address: &str, timeout_secs: u64) -> Vec<String> {
    vec![
        "-c".into(),
        "1".into(),
        "-W".into(),
        (timeout_secs * 1000).to_string(),
        address.into(),
    ]
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

pub async fn ping_target(ipv4: &str, timeout_secs: u64) -> CommandResult<ParsedPing> {
    let mut cmd = Command::new("ping");
    cmd.args(build_ping_args(ipv4, timeout_secs));
    // 仅在 Windows 上使用 creation_flags
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| AppError::PingCommand(e.to_string()))?;

    let text = if cfg!(target_os = "windows") {
        // Windows 使用 GBK 解码
        let (text, _, _) = GBK.decode(&output.stdout);
        text.to_string()
    } else {
        // Unix 系统通常使用 UTF-8
        String::from_utf8_lossy(&output.stdout).to_string()
    };
    
    // println!("output{}", text);
    Ok(parse_ping_output(&text))
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

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn linux_ping_args_use_second_wait() {
        assert_eq!(
            build_ping_args("127.0.0.1", 5),
            vec!["-c".to_string(), "1".to_string(), "-W".to_string(), "5".to_string(), "127.0.0.1".to_string()]
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_ping_args_use_millisecond_wait() {
        assert_eq!(
            build_ping_args("127.0.0.1", 5),
            vec!["-n".to_string(), "1".to_string(), "-w".to_string(), "5000".to_string(), "127.0.0.1".to_string()]
        );
    }
}
