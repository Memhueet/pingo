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

#[cfg(target_os = "windows")]
fn parse_ping_output_windows(output: &str) -> ParsedPing {
    // 1. 先检查失败情况（提前返回，避免后续无效解析）
    if output.contains("100.0% 丢失") || output.contains("100% 丢失")
        || output.contains("请求超时") || output.contains("Request timed out")
        || output.contains("0 个已接收") || output.contains("0 packets received")
        || output.contains("无法访问目标主机") || output.contains("Destination host unreachable")
        || output.contains("一般故障") || output.contains("General failure")
        || output.contains("目标主机不可达") 
    {
        return ParsedPing::Timeout;
    }

    // 2. 尝试从单独的回复行提取延迟
    for line in output.lines() {
        // 处理中文格式: "时间=25ms" 或 "时间<1ms"
        if let Some(time_pos) = line.find("时间=") {
            // 安全切片：加上子串本身的长度
            let rest = &line[time_pos + "时间=".len()..]; 
            if let Some(ms_pos) = rest.find("ms") {
                let num_str = rest[..ms_pos].trim();
                // 处理 "<1" 这种特殊情况
                let latency = if num_str.starts_with('<') {
                    0.0 // 或者 0.9，视你的业务需求而定
                } else if let Ok(val) = num_str.parse::<f64>() {
                    val
                } else {
                    continue;
                };
                return ParsedPing::Success { latency_ms: latency };
            }
        }
        
        // 处理英文格式: "time=25ms"
        if let Some(time_pos) = line.find("time=") {
            let rest = &line[time_pos + "time=".len()..];
            if let Some(end) = rest.find("ms") {
                let num_str = rest[..end].trim();
                if let Ok(latency_ms) = num_str.parse::<f64>() {
                    return ParsedPing::Success { latency_ms };
                }
            }
        }
    }

    // 3. 从统计行提取平均延迟（作为备选方案）
    for line in output.lines() {
        // 中文: "平均 = "
        if let Some(avg_pos) = line.find("平均 = ") {
            // 核心修复：使用 "平均 = ".len() 而不是手动写 4 或 5
            let rest = &line[avg_pos + "平均 = ".len()..];
            if let Some(ms_pos) = rest.find("ms") {
                let num_str = rest[..ms_pos].trim();
                if let Ok(latency_ms) = num_str.parse::<f64>() {
                    return ParsedPing::Success { latency_ms };
                }
            }
        }
        
        // 英文: "Average = "
        if let Some(avg_pos) = line.find("Average = ") {
            let rest = &line[avg_pos + "Average = ".len()..];
            if let Some(end) = rest.find("ms") {
                let num_str = rest[..end].trim();
                if let Ok(latency_ms) = num_str.parse::<f64>() {
                    return ParsedPing::Success { latency_ms };
                }
            }
        }
    }

    // 如果成功 ping 通但实在解析不出延迟，返回明确错误
    ParsedPing::Error {
        kind: "unrecognizedOutput".to_string(),
    }
}

#[cfg(not(target_os = "windows"))]
fn parse_ping_output_unix(output: &str) -> ParsedPing {
    // 1. Try to extract latency from an individual reply line: "time=4.542 ms"
    for token in output.split_whitespace() {
        if let Some(value) = token.strip_prefix("time=") {
            let clean = value.trim_end_matches("ms").trim();
            if let Ok(latency_ms) = clean.parse::<f64>() {
                return ParsedPing::Success { latency_ms };
            }
        }
    }

    // 2. Fallback: parse the avg latency from the round-trip statistics line.
    //    Format: "round-trip min/avg/max/stddev = 7.733/7.733/7.733/nan ms"
    for line in output.lines() {
        if let Some(stats) = line.strip_prefix("round-trip min/avg/max/stddev = ") {
            let clean = stats.trim_end_matches(" ms").trim();
            let parts: Vec<&str> = clean.split('/').collect();
            if parts.len() >= 2 {
                if let Ok(latency_ms) = parts[1].trim().parse::<f64>() {
                    return ParsedPing::Success { latency_ms };
                }
            }
        }
    }

    // 3. Check for known timeout indicators
    if output.contains("100.0% packet loss")
        || output.contains("100% loss")
        || output.contains("Request timed out")
        || output.contains("0 packets received")
    {
        return ParsedPing::Timeout;
    }

    ParsedPing::Error {
        kind: "unrecognizedOutput".to_string(),
    }
}

pub fn parse_ping_output(output: &str) -> ParsedPing {
    // 检测操作系统类型
    #[cfg(target_os = "windows")]
    {
        parse_ping_output_windows(output)
    }
    #[cfg(not(target_os = "windows"))]
    {
        parse_ping_output_unix(output)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_macos_post_wait_timeout_latency() {
        let text = include_str!("../fixtures/ping_macos_post_wait_timeout.txt");
        let parsed = parse_ping_output(text);
        assert_eq!(parsed, ParsedPing::success(7.733));
    }

    #[test]
    fn parses_macos_success_latency() {
        let text = include_str!("../fixtures/ping_macos_success.txt");
        let parsed = parse_ping_output(text);
        assert_eq!(parsed, ParsedPing::success(3.421));
    }

    #[test]
    fn parses_macos_timeout() {
        let text = include_str!("../fixtures/ping_macos_timeout.txt");
        let parsed = parse_ping_output(text);
        assert_eq!(parsed, ParsedPing::timeout());
    }

    #[test]
    fn parses_windows_success_latency() {
        let text = include_str!("../fixtures/ping_windows_success.txt");
        let parsed = parse_ping_output(text);
        assert_eq!(parsed, ParsedPing::success(4.0));
    }

    #[test]
    fn parses_windows_timeout() {
        let text = include_str!("../fixtures/ping_windows_timeout.txt");
        let parsed = parse_ping_output(text);
        assert_eq!(parsed, ParsedPing::timeout());
    }
}
