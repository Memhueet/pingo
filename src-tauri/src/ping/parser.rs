use super::ParsedPing;

pub fn parse_ping_output(output: &str) -> ParsedPing {
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
    fn parses_macos_ipv6_success() {
        let text = include_str!("../fixtures/ping_macos_ipv6_success.txt");
        assert!(matches!(
            parse_ping_output(text),
            ParsedPing::Success { .. }
        ));
    }
}
