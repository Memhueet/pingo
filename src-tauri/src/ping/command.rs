use std::process::Stdio;
use tokio::process::Command;

use super::parser::{parse_ping_output, ParsedPing};
use crate::error::{AppError, CommandResult};

use encoding_rs::GBK;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub async fn ping_target(ipv4: &str, timeout_secs: u64) -> CommandResult<ParsedPing> {
    let timeout_str = timeout_secs.to_string();

    let args: &[&str] = if cfg!(target_os = "windows") {
        &["-n", "1", "-w", &timeout_str, ipv4]
    } else {
        &["-c", "1", "-W", &timeout_str, ipv4]
    };

    let mut cmd = Command::new("ping");
    cmd.args(args);
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
}
