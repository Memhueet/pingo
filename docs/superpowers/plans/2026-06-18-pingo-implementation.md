# Pingo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first distributable macOS and Windows version of Pingo: a Tauri + Rust desktop app that pings IPv4 targets, records latency to SQLite, and displays overview-first interactive bar charts.

**Architecture:** Rust owns ping execution, SQLite storage, settings, scheduling, and Tauri commands/events. React + TypeScript owns target editing, settings UI, overview cards, historical file viewing, and chart interactions. The first implementation uses system `ping` commands instead of raw ICMP so ordinary users can run the packaged app without special network privileges.

**Tech Stack:** Tauri v2, Rust, Tokio, rusqlite, serde, chrono, uuid, thiserror, React, TypeScript, Vite, @tauri-apps/api, @tauri-apps/plugin-dialog, uPlot.

---

## Reference Documents

- Spec: `docs/superpowers/specs/2026-06-18-pingo-design.md`
- Chinese spec: `docs/superpowers/specs/2026-06-18-pingo-design.zh-CN.md`
- Tauri v2 project setup: https://v2.tauri.app/start/create-project/
- Tauri v2 frontend-to-Rust commands: https://v2.tauri.app/develop/calling-rust/
- Tauri v2 dialog plugin: https://v2.tauri.app/plugin/dialog/

## File Structure

Create or modify these files during implementation.

Frontend:

- `package.json`: npm scripts and frontend dependencies.
- `index.html`: Vite entry HTML.
- `tsconfig.json`: TypeScript project settings.
- `vite.config.ts`: Vite React configuration.
- `src/main.tsx`: React boot entry.
- `src/App.tsx`: top-level application composition.
- `src/api/tauri.ts`: typed wrappers around Tauri commands and event subscriptions.
- `src/types.ts`: shared frontend types matching Rust command payloads.
- `src/state/usePingoStore.ts`: frontend state and command orchestration.
- `src/components/Toolbar.tsx`: add target, batch import, file menu, settings, start/stop ping, ping status visualization.
- `src/components/TargetGrid.tsx`: overview-first card grid with sort controls (sort mode dropdown + asc/desc buttons), multi-select support.
- `src/components/TargetCard.tsx`: one target card with IP, alias, stats (avg latency, sent, timeouts, timeout rate), enable/disable toggle, right-click context menu.
- `src/components/DetailPanel.tsx`: selected target chart, zoom, pan, statistics, chart container for responsive layout.
- `src/components/TargetEditor.tsx`: target create/edit dialog.
- `src/components/SettingsPanel.tsx`: interval, timeout, retention, alert threshold settings.
- `src/components/LatencyChart.tsx`: uPlot detail chart with auto-scaling, external legend, ResizeObserver for responsive height.
- `src/components/EventLog.tsx`: event log panel showing recent timeout, error, alert, and operation messages.
- `src/styles.css`: app layout and state styling.
- `src/__tests__/store.test.ts`: frontend state tests.
- `src/__tests__/charts.test.tsx`: chart rendering smoke tests.

Tauri and Rust:

- `src-tauri/Cargo.toml`: Rust dependencies.
- `src-tauri/tauri.conf.json`: app metadata, build hooks, plugin configuration.
- `src-tauri/capabilities/default.json`: Tauri permissions for app commands and dialog plugin.
- `src-tauri/src/main.rs`: Tauri app setup and managed state.
- `src-tauri/src/lib.rs`: module exports for tests.
- `src-tauri/src/error.rs`: normalized app error and command result helpers.
- `src-tauri/src/models.rs`: shared Rust data types.
- `src-tauri/src/ping/mod.rs`: ping module facade.
- `src-tauri/src/ping/parser.rs`: platform output parsing.
- `src-tauri/src/ping/command.rs`: system command construction and execution.
- `src-tauri/src/storage.rs`: SQLite schema, queries, retention cleanup, clear_samples with VACUUM for space recovery.
- `src-tauri/src/config.rs`: settings persistence and defaults.
- `src-tauri/src/scheduler.rs`: periodic ping loop and alert state.
- `src-tauri/src/commands.rs`: Tauri command handlers.
- `src-tauri/src/fixtures/ping_macos_success.txt`: parser fixture.
- `src-tauri/src/fixtures/ping_macos_timeout.txt`: parser fixture.
- `src-tauri/src/fixtures/ping_windows_success.txt`: parser fixture.
- `src-tauri/src/fixtures/ping_windows_timeout.txt`: parser fixture.

Documentation:

- `README.md`: local development, test, and packaging commands.

## Task 1: Scaffold Tauri React App

**Files:**

- Create: `package.json`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Modify: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Create the Tauri v2 project skeleton**

Run:

```bash
npm create tauri-app@latest . -- --template react-ts
```

Expected: the command creates `src/`, `src-tauri/`, `package.json`, and Vite/Tauri config files. If the command prompts, choose:

```text
Project name: Pingo
Identifier: com.pingo.app
Frontend language: TypeScript / JavaScript
Package manager: npm
UI template: React
UI flavor: TypeScript
```

- [ ] **Step 2: Install frontend dependencies**

Run:

```bash
npm install
npm install @tauri-apps/api @tauri-apps/plugin-dialog uplot
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

Expected: `package-lock.json` exists and npm reports no install errors.

- [ ] **Step 3: Install Rust dependencies**

Edit `src-tauri/Cargo.toml` so the dependency section contains:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "process", "rt-multi-thread", "sync", "time"] }
rusqlite = { version = "0.32", features = ["bundled", "chrono", "uuid"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["serde", "v4"] }
thiserror = "2"
dirs = "5"

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 4: Configure Tauri app identity and plugin**

Edit `src-tauri/tauri.conf.json` so the app identity is:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Pingo",
  "version": "0.1.0",
  "identifier": "com.pingo.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Pingo",
        "width": 1180,
        "height": 780,
        "minWidth": 900,
        "minHeight": 620
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 5: Add app permissions**

Create `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Main Pingo desktop window permissions",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default"
  ]
}
```

- [ ] **Step 6: Wire the dialog plugin**

Set `src-tauri/src/main.rs` to:

```rust
fn main() {
    pingo_lib::run();
}
```

Create `src-tauri/src/lib.rs`:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("failed to run Pingo");
}
```

- [ ] **Step 7: Replace starter UI with a neutral shell**

Set `src/App.tsx` to:

```tsx
import "./styles.css";

export default function App() {
  return (
    <main className="appShell">
      <header className="topBar">
        <div>
          <h1>Pingo</h1>
          <p>IPv4 latency monitor</p>
        </div>
      </header>
      <section className="emptyState">Pingo is starting up.</section>
    </main>
  );
}
```

Set `src/main.tsx` to:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

Set `src/styles.css` to:

```css
:root {
  color: #1f2933;
  background: #f6f8fb;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

button,
input {
  font: inherit;
}

.appShell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.topBar {
  height: 72px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #dde3ea;
  background: #ffffff;
}

.topBar h1 {
  margin: 0;
  font-size: 22px;
}

.topBar p {
  margin: 4px 0 0;
  color: #65758b;
  font-size: 13px;
}

.emptyState {
  margin: 24px;
  padding: 24px;
  border: 1px dashed #a7b3c2;
  border-radius: 8px;
  color: #65758b;
  background: #ffffff;
}
```

- [ ] **Step 8: Add README commands**

Create `README.md`:

```markdown
# Pingo

Pingo is a Tauri + Rust desktop app for monitoring IPv4 reachability and latency.

## Development

```bash
npm install
npm run tauri dev
```

## Tests

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

## Build

```bash
npm run tauri build
```
```

- [ ] **Step 9: Verify scaffold**

Run:

```bash
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: frontend build succeeds and Rust tests compile with zero failures.

- [ ] **Step 10: Commit**

Run:

```bash
git add .gitignore README.md package.json package-lock.json index.html tsconfig.json vite.config.ts src src-tauri
git commit -m "chore: scaffold Pingo Tauri app"
```

## Task 2: Add Shared Rust Models And Error Types

**Files:**

- Create: `src-tauri/src/models.rs`
- Create: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add model tests**

Create `src-tauri/src/models.rs` with tests first:

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

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
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml models
```

Expected: FAIL because `AppSettings` and `is_valid_ipv4` are not defined.

- [ ] **Step 3: Implement shared models**

Replace `src-tauri/src/models.rs` with:

```rust
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
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ping_interval_seconds: 5,
            ping_timeout_seconds: 5,
            retention_days: 7,
            alert_threshold: 3,
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
pub struct TargetStatus {
    pub target: Target,
    pub latest_sample: Option<PingSample>,
    pub consecutive_timeouts: u32,
    pub alerting: bool,
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
}
```

- [ ] **Step 4: Add normalized errors**

Create `src-tauri/src/error.rs`:

```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Only IPv4 addresses are supported in this version.")]
    InvalidIpv4,
    #[error("The ping command failed: {0}")]
    PingCommand(String),
    #[error("The data file could not be opened.")]
    DataFileOpen,
    #[error("Monitoring history could not be saved.")]
    StorageWrite,
    #[error("Storage error: {0}")]
    Storage(String),
    #[error("Configuration error: {0}")]
    Config(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub kind: String,
    pub message: String,
}

impl From<AppError> for CommandError {
    fn from(error: AppError) -> Self {
        let kind = match error {
            AppError::InvalidIpv4 => "invalidIpv4",
            AppError::PingCommand(_) => "pingCommand",
            AppError::DataFileOpen => "dataFileOpen",
            AppError::StorageWrite => "storageWrite",
            AppError::Storage(_) => "storage",
            AppError::Config(_) => "config",
        };
        Self {
            kind: kind.to_string(),
            message: error.to_string(),
        }
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
```

- [ ] **Step 5: Export modules**

Update `src-tauri/src/lib.rs`:

```rust
pub mod error;
pub mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("failed to run Pingo");
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml models
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src-tauri/src/models.rs src-tauri/src/error.rs src-tauri/src/lib.rs
git commit -m "feat: add shared Rust models"
```

## Task 3: Implement Ping Output Parsing And Command Execution

**Files:**

- Create: `src-tauri/src/ping/mod.rs`
- Create: `src-tauri/src/ping/parser.rs`
- Create: `src-tauri/src/ping/command.rs`
- Create: `src-tauri/src/fixtures/ping_macos_success.txt`
- Create: `src-tauri/src/fixtures/ping_macos_timeout.txt`
- Create: `src-tauri/src/fixtures/ping_windows_success.txt`
- Create: `src-tauri/src/fixtures/ping_windows_timeout.txt`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add parser fixtures**

Create `src-tauri/src/fixtures/ping_macos_success.txt`:

```text
PING 192.168.1.1 (192.168.1.1): 56 data bytes
64 bytes from 192.168.1.1: icmp_seq=0 ttl=64 time=3.421 ms

--- 192.168.1.1 ping statistics ---
1 packets transmitted, 1 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 3.421/3.421/3.421/0.000 ms
```

Create `src-tauri/src/fixtures/ping_macos_timeout.txt`:

```text
PING 10.0.0.250 (10.0.0.250): 56 data bytes

--- 10.0.0.250 ping statistics ---
1 packets transmitted, 0 packets received, 100.0% packet loss
```

Create `src-tauri/src/fixtures/ping_windows_success.txt`:

```text
Pinging 192.168.1.1 with 32 bytes of data:
Reply from 192.168.1.1: bytes=32 time=4ms TTL=64

Ping statistics for 192.168.1.1:
    Packets: Sent = 1, Received = 1, Lost = 0 (0% loss),
Approximate round trip times in milli-seconds:
    Minimum = 4ms, Maximum = 4ms, Average = 4ms
```

Create `src-tauri/src/fixtures/ping_windows_timeout.txt`:

```text
Pinging 10.0.0.250 with 32 bytes of data:
Request timed out.

Ping statistics for 10.0.0.250:
    Packets: Sent = 1, Received = 0, Lost = 1 (100% loss),
```

- [ ] **Step 2: Write failing parser tests**

Create `src-tauri/src/ping/parser.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

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
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml ping::parser
```

Expected: FAIL because `ParsedPing` and `parse_ping_output` are not defined.

- [ ] **Step 4: Implement parser**

Replace `src-tauri/src/ping/parser.rs` with:

```rust
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

pub fn parse_ping_output(output: &str) -> ParsedPing {
    if output.contains("100.0% packet loss")
        || output.contains("100% loss")
        || output.contains("Request timed out")
        || output.contains("0 packets received")
    {
        return ParsedPing::Timeout;
    }

    for token in output.split_whitespace() {
        if let Some(value) = token.strip_prefix("time=") {
            let clean = value.trim_end_matches("ms").trim();
            if let Ok(latency_ms) = clean.parse::<f64>() {
                return ParsedPing::Success { latency_ms };
            }
        }
    }

    ParsedPing::Error {
        kind: "unrecognizedOutput".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
```

- [ ] **Step 5: Implement command runner**

Create `src-tauri/src/ping/command.rs`:

```rust
use chrono::Utc;
use tokio::process::Command;
use uuid::Uuid;

use crate::error::AppError;
use crate::models::{PingSample, PingStatus};

use super::parser::{parse_ping_output, ParsedPing};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PingRequest {
    pub target_id: Uuid,
    pub ipv4: String,
    pub timeout_seconds: u64,
}

pub async fn ping_once(request: PingRequest) -> Result<PingSample, AppError> {
    let output = build_command(&request.ipv4, request.timeout_seconds)
        .output()
        .await
        .map_err(|error| AppError::PingCommand(error.to_string()))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{stdout}\n{stderr}");
    let parsed = parse_ping_output(&combined);

    let (status, latency_ms, error_kind) = match parsed {
        ParsedPing::Success { latency_ms } => (PingStatus::Success, Some(latency_ms), None),
        ParsedPing::Timeout => (PingStatus::Timeout, None, Some("timeout".to_string())),
        ParsedPing::Error { kind } => (PingStatus::Error, None, Some(kind)),
    };

    Ok(PingSample {
        id: Uuid::new_v4(),
        target_id: request.target_id,
        sent_at: Utc::now(),
        status,
        latency_ms,
        error_kind,
    })
}

fn build_command(ipv4: &str, timeout_seconds: u64) -> Command {
    let mut command = Command::new("ping");
    if cfg!(target_os = "windows") {
        command
            .arg("-n")
            .arg("1")
            .arg("-w")
            .arg((timeout_seconds * 1000).to_string())
            .arg(ipv4);
    } else {
        command
            .arg("-c")
            .arg("1")
            .arg("-W")
            .arg(timeout_seconds.to_string())
            .arg(ipv4);
    }
    command
}
```

- [ ] **Step 6: Export ping module**

Create `src-tauri/src/ping/mod.rs`:

```rust
pub mod command;
pub mod parser;

pub use command::{ping_once, PingRequest};
pub use parser::{parse_ping_output, ParsedPing};
```

Update `src-tauri/src/lib.rs`:

```rust
pub mod error;
pub mod models;
pub mod ping;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("failed to run Pingo");
}
```

- [ ] **Step 7: Run parser tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml ping::parser
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src-tauri/src/lib.rs src-tauri/src/ping src-tauri/src/fixtures
git commit -m "feat: parse platform ping output"
```

## Task 4: Implement SQLite Storage

**Files:**

- Create: `src-tauri/src/storage.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing storage tests**

Create `src-tauri/src/storage.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{PingSample, PingStatus, Target};
    use chrono::{Duration, Utc};
    use tempfile::tempdir;
    use uuid::Uuid;

    fn sample_target() -> Target {
        let now = Utc::now();
        Target {
            id: Uuid::new_v4(),
            ipv4: "192.168.1.1".to_string(),
            alias: "Router".to_string(),
            enabled: true,
            created_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn writes_and_reads_targets_and_samples() {
        let dir = tempdir().unwrap();
        let db = Storage::open(dir.path().join("pingo.sqlite")).unwrap();
        let target = sample_target();
        db.upsert_target(&target).unwrap();
        let sample = PingSample {
            id: Uuid::new_v4(),
            target_id: target.id,
            sent_at: Utc::now(),
            status: PingStatus::Success,
            latency_ms: Some(8.5),
            error_kind: None,
        };
        db.insert_sample(&sample).unwrap();

        assert_eq!(db.list_targets().unwrap(), vec![target.clone()]);
        assert_eq!(db.samples_for_target(target.id, None, None).unwrap(), vec![sample]);
    }

    #[test]
    fn cleans_up_expired_samples() {
        let dir = tempdir().unwrap();
        let db = Storage::open(dir.path().join("pingo.sqlite")).unwrap();
        let target = sample_target();
        db.upsert_target(&target).unwrap();
        let old_sample = PingSample {
            id: Uuid::new_v4(),
            target_id: target.id,
            sent_at: Utc::now() - Duration::days(9),
            status: PingStatus::Timeout,
            latency_ms: None,
            error_kind: Some("timeout".to_string()),
        };
        db.insert_sample(&old_sample).unwrap();
        db.cleanup_retention(7).unwrap();

        assert!(db.samples_for_target(target.id, None, None).unwrap().is_empty());
    }
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml storage
```

Expected: FAIL because `Storage` is not defined.

- [ ] **Step 3: Implement storage**

Replace `src-tauri/src/storage.rs` with the storage implementation:

```rust
use std::path::Path;
use std::sync::{Arc, Mutex};

use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::{PingSample, PingStatus, Target};

#[derive(Clone)]
pub struct Storage {
    connection: Arc<Mutex<Connection>>,
}

impl Storage {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, AppError> {
        let connection = Connection::open(path).map_err(|_| AppError::DataFileOpen)?;
        let storage = Self {
            connection: Arc::new(Mutex::new(connection)),
        };
        storage.migrate()?;
        Ok(storage)
    }

    pub fn open_memory() -> Result<Self, AppError> {
        let connection = Connection::open_in_memory().map_err(|error| AppError::Storage(error.to_string()))?;
        let storage = Self {
            connection: Arc::new(Mutex::new(connection)),
        };
        storage.migrate()?;
        Ok(storage)
    }

    fn migrate(&self) -> Result<(), AppError> {
        let connection = self.connection.lock().map_err(|error| AppError::Storage(error.to_string()))?;
        connection
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS targets (
                    id TEXT PRIMARY KEY,
                    ipv4 TEXT NOT NULL,
                    alias TEXT NOT NULL,
                    enabled INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS ping_samples (
                    id TEXT PRIMARY KEY,
                    target_id TEXT NOT NULL,
                    sent_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    latency_ms REAL,
                    error_kind TEXT,
                    FOREIGN KEY(target_id) REFERENCES targets(id)
                );
                CREATE INDEX IF NOT EXISTS idx_ping_samples_target_time
                    ON ping_samples(target_id, sent_at);
                ",
            )
            .map_err(|error| AppError::Storage(error.to_string()))
    }

    pub fn upsert_target(&self, target: &Target) -> Result<(), AppError> {
        let connection = self.connection.lock().map_err(|error| AppError::Storage(error.to_string()))?;
        connection
            .execute(
                "
                INSERT INTO targets (id, ipv4, alias, enabled, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ON CONFLICT(id) DO UPDATE SET
                    ipv4 = excluded.ipv4,
                    alias = excluded.alias,
                    enabled = excluded.enabled,
                    updated_at = excluded.updated_at
                ",
                params![
                    target.id.to_string(),
                    target.ipv4,
                    target.alias,
                    target.enabled as i64,
                    target.created_at.to_rfc3339(),
                    target.updated_at.to_rfc3339(),
                ],
            )
            .map_err(|error| AppError::Storage(error.to_string()))?;
        Ok(())
    }

    pub fn list_targets(&self) -> Result<Vec<Target>, AppError> {
        let connection = self.connection.lock().map_err(|error| AppError::Storage(error.to_string()))?;
        let mut statement = connection
            .prepare("SELECT id, ipv4, alias, enabled, created_at, updated_at FROM targets ORDER BY created_at")
            .map_err(|error| AppError::Storage(error.to_string()))?;
        let rows = statement
            .query_map([], |row| target_from_row(row))
            .map_err(|error| AppError::Storage(error.to_string()))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| AppError::Storage(error.to_string()))
    }

    pub fn delete_target(&self, id: Uuid) -> Result<(), AppError> {
        let connection = self.connection.lock().map_err(|error| AppError::Storage(error.to_string()))?;
        connection
            .execute("UPDATE targets SET enabled = 0, updated_at = ?1 WHERE id = ?2", params![Utc::now().to_rfc3339(), id.to_string()])
            .map_err(|error| AppError::Storage(error.to_string()))?;
        Ok(())
    }

    pub fn insert_sample(&self, sample: &PingSample) -> Result<(), AppError> {
        let connection = self.connection.lock().map_err(|error| AppError::Storage(error.to_string()))?;
        connection
            .execute(
                "
                INSERT INTO ping_samples (id, target_id, sent_at, status, latency_ms, error_kind)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ",
                params![
                    sample.id.to_string(),
                    sample.target_id.to_string(),
                    sample.sent_at.to_rfc3339(),
                    status_to_str(sample.status),
                    sample.latency_ms,
                    sample.error_kind,
                ],
            )
            .map_err(|_| AppError::StorageWrite)?;
        Ok(())
    }

    pub fn samples_for_target(
        &self,
        target_id: Uuid,
        from: Option<DateTime<Utc>>,
        to: Option<DateTime<Utc>>,
    ) -> Result<Vec<PingSample>, AppError> {
        let from = from.unwrap_or_else(|| DateTime::<Utc>::from(std::time::UNIX_EPOCH));
        let to = to.unwrap_or_else(Utc::now);
        let connection = self.connection.lock().map_err(|error| AppError::Storage(error.to_string()))?;
        let mut statement = connection
            .prepare(
                "
                SELECT id, target_id, sent_at, status, latency_ms, error_kind
                FROM ping_samples
                WHERE target_id = ?1 AND sent_at >= ?2 AND sent_at <= ?3
                ORDER BY sent_at
                ",
            )
            .map_err(|error| AppError::Storage(error.to_string()))?;
        let rows = statement
            .query_map(params![target_id.to_string(), from.to_rfc3339(), to.to_rfc3339()], |row| sample_from_row(row))
            .map_err(|error| AppError::Storage(error.to_string()))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| AppError::Storage(error.to_string()))
    }

    pub fn cleanup_retention(&self, retention_days: i64) -> Result<(), AppError> {
        let cutoff = Utc::now() - Duration::days(retention_days);
        let connection = self.connection.lock().map_err(|error| AppError::Storage(error.to_string()))?;
        connection
            .execute("DELETE FROM ping_samples WHERE sent_at < ?1", params![cutoff.to_rfc3339()])
            .map_err(|error| AppError::Storage(error.to_string()))?;
        Ok(())
    }
}

fn target_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Target> {
    Ok(Target {
        id: parse_uuid(row.get::<_, String>(0)?),
        ipv4: row.get(1)?,
        alias: row.get(2)?,
        enabled: row.get::<_, i64>(3)? == 1,
        created_at: parse_datetime(row.get::<_, String>(4)?),
        updated_at: parse_datetime(row.get::<_, String>(5)?),
    })
}

fn sample_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PingSample> {
    Ok(PingSample {
        id: parse_uuid(row.get::<_, String>(0)?),
        target_id: parse_uuid(row.get::<_, String>(1)?),
        sent_at: parse_datetime(row.get::<_, String>(2)?),
        status: str_to_status(&row.get::<_, String>(3)?),
        latency_ms: row.get(4)?,
        error_kind: row.get(5)?,
    })
}

fn parse_uuid(value: String) -> Uuid {
    Uuid::parse_str(&value).expect("stored uuid is valid")
}

fn parse_datetime(value: String) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(&value).expect("stored timestamp is valid").with_timezone(&Utc)
}

fn status_to_str(status: PingStatus) -> &'static str {
    match status {
        PingStatus::Success => "success",
        PingStatus::Timeout => "timeout",
        PingStatus::Error => "error",
    }
}

fn str_to_status(value: &str) -> PingStatus {
    match value {
        "success" => PingStatus::Success,
        "timeout" => PingStatus::Timeout,
        _ => PingStatus::Error,
    }
}
```

- [ ] **Step 4: Export storage module**

Update the top of `src-tauri/src/lib.rs`:

```rust
pub mod error;
pub mod models;
pub mod ping;
pub mod storage;
```

- [ ] **Step 5: Run storage tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml storage
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src-tauri/src/storage.rs src-tauri/src/lib.rs
git commit -m "feat: persist targets and ping samples"
```

## Task 5: Implement Settings Config And App State

**Files:**

- Create: `src-tauri/src/config.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing config tests**

Create `src-tauri/src/config.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn missing_config_uses_defaults() {
        let dir = tempdir().unwrap();
        let config = ConfigStore::open(dir.path()).unwrap();
        assert_eq!(config.load().unwrap(), AppSettings::default());
    }

    #[test]
    fn saves_and_loads_settings() {
        let dir = tempdir().unwrap();
        let config = ConfigStore::open(dir.path()).unwrap();
        let settings = AppSettings {
            ping_interval_seconds: 8,
            ping_timeout_seconds: 4,
            retention_days: 30,
            alert_threshold: 5,
        };
        config.save(&settings).unwrap();
        assert_eq!(config.load().unwrap(), settings);
    }
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml config
```

Expected: FAIL because `ConfigStore` is not defined.

- [ ] **Step 3: Implement config store**

Replace `src-tauri/src/config.rs` with:

```rust
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::AppError;
use crate::models::AppSettings;

#[derive(Debug, Clone)]
pub struct ConfigStore {
    path: PathBuf,
}

impl ConfigStore {
    pub fn open(app_data_dir: impl AsRef<Path>) -> Result<Self, AppError> {
        fs::create_dir_all(app_data_dir.as_ref()).map_err(|error| AppError::Config(error.to_string()))?;
        Ok(Self {
            path: app_data_dir.as_ref().join("settings.json"),
        })
    }

    pub fn load(&self) -> Result<AppSettings, AppError> {
        if !self.path.exists() {
            return Ok(AppSettings::default());
        }
        let text = fs::read_to_string(&self.path).map_err(|error| AppError::Config(error.to_string()))?;
        serde_json::from_str(&text).map_err(|error| AppError::Config(error.to_string()))
    }

    pub fn save(&self, settings: &AppSettings) -> Result<(), AppError> {
        let text = serde_json::to_string_pretty(settings).map_err(|error| AppError::Config(error.to_string()))?;
        fs::write(&self.path, text).map_err(|error| AppError::Config(error.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn missing_config_uses_defaults() {
        let dir = tempdir().unwrap();
        let config = ConfigStore::open(dir.path()).unwrap();
        assert_eq!(config.load().unwrap(), AppSettings::default());
    }

    #[test]
    fn saves_and_loads_settings() {
        let dir = tempdir().unwrap();
        let config = ConfigStore::open(dir.path()).unwrap();
        let settings = AppSettings {
            ping_interval_seconds: 8,
            ping_timeout_seconds: 4,
            retention_days: 30,
            alert_threshold: 5,
        };
        config.save(&settings).unwrap();
        assert_eq!(config.load().unwrap(), settings);
    }
}
```

- [ ] **Step 4: Export config module**

Update the top of `src-tauri/src/lib.rs`:

```rust
pub mod config;
pub mod error;
pub mod models;
pub mod ping;
pub mod storage;
```

- [ ] **Step 5: Run config tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml config
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src-tauri/src/config.rs src-tauri/src/lib.rs
git commit -m "feat: persist app settings"
```

## Task 6: Implement Scheduler And Realtime Events

**Files:**

- Create: `src-tauri/src/scheduler.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write scheduler unit tests**

Create `src-tauri/src/scheduler.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{PingSample, PingStatus};
    use chrono::Utc;
    use uuid::Uuid;

    #[test]
    fn consecutive_timeout_counter_resets_on_success() {
        let target_id = Uuid::new_v4();
        let mut tracker = AlertTracker::new(3);
        let timeout = PingSample {
            id: Uuid::new_v4(),
            target_id,
            sent_at: Utc::now(),
            status: PingStatus::Timeout,
            latency_ms: None,
            error_kind: Some("timeout".to_string()),
        };
        let success = PingSample {
            status: PingStatus::Success,
            latency_ms: Some(2.0),
            error_kind: None,
            ..timeout.clone()
        };

        assert!(!tracker.record(&timeout).alerting);
        assert!(!tracker.record(&timeout).alerting);
        assert!(tracker.record(&timeout).alerting);
        assert!(!tracker.record(&success).alerting);
    }
}
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml scheduler
```

Expected: FAIL because `AlertTracker` is not defined.

- [ ] **Step 3: Implement scheduler primitives**

Replace `src-tauri/src/scheduler.rs` with:

```rust
use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::watch;
use tokio::time::{sleep, Duration};
use uuid::Uuid;

use crate::models::{AppSettings, PingSample, PingStatus, Target};
use crate::ping::{ping_once, PingRequest};
use crate::storage::Storage;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AlertState {
    pub target_id: Uuid,
    pub consecutive_timeouts: u32,
    pub alerting: bool,
}

pub struct AlertTracker {
    threshold: u32,
    counts: HashMap<Uuid, u32>,
}

impl AlertTracker {
    pub fn new(threshold: u32) -> Self {
        Self {
            threshold,
            counts: HashMap::new(),
        }
    }

    pub fn record(&mut self, sample: &PingSample) -> AlertState {
        let count = match sample.status {
            PingStatus::Timeout => {
                let entry = self.counts.entry(sample.target_id).or_insert(0);
                *entry += 1;
                *entry
            }
            PingStatus::Success | PingStatus::Error => {
                self.counts.insert(sample.target_id, 0);
                0
            }
        };

        AlertState {
            target_id: sample.target_id,
            consecutive_timeouts: count,
            alerting: count >= self.threshold,
        }
    }
}

#[derive(Clone)]
pub struct SchedulerConfig {
    pub settings: AppSettings,
    pub targets: Vec<Target>,
}

pub struct Scheduler {
    pub ping_running: bool,
    storage: Storage,
    sender: watch::Sender<SchedulerConfig>,
}

impl Scheduler {
    pub fn new(storage: Storage, config: SchedulerConfig) -> Self {
        let (sender, _) = watch::channel(config);
        Self { storage, sender }
    }

    pub fn update(&self, config: SchedulerConfig) {
        let _ = self.sender.send(config);
    }

    pub fn start<F>(&self, mut on_sample: F)
    where
        F: FnMut(PingSample, AlertState) + Send + 'static,
    {
        let mut receiver = self.sender.subscribe();
        let storage = self.storage.clone();
        tokio::spawn(async move {
            let mut tracker = AlertTracker::new(receiver.borrow().settings.alert_threshold);
            loop {
                let config = receiver.borrow().clone();
                tracker = AlertTracker::new(config.settings.alert_threshold);
                for target in config.targets.iter().filter(|target| target.enabled) {
                    let request = PingRequest {
                        target_id: target.id,
                        ipv4: target.ipv4.clone(),
                        timeout_seconds: config.settings.ping_timeout_seconds,
                    };
                    if let Ok(sample) = ping_once(request).await {
                        let _ = storage.insert_sample(&sample);
                        let alert = tracker.record(&sample);
                        on_sample(sample, alert);
                    }
                }
                storage.cleanup_retention(config.settings.retention_days).ok();
                tokio::select! {
                    _ = sleep(Duration::from_secs(config.settings.ping_interval_seconds)) => {}
                    changed = receiver.changed() => {
                        if changed.is_err() {
                            break;
                        }
                    }
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{PingSample, PingStatus};
    use chrono::Utc;
    use uuid::Uuid;

    #[test]
    fn consecutive_timeout_counter_resets_on_success() {
        let target_id = Uuid::new_v4();
        let mut tracker = AlertTracker::new(3);
        let timeout = PingSample {
            id: Uuid::new_v4(),
            target_id,
            sent_at: Utc::now(),
            status: PingStatus::Timeout,
            latency_ms: None,
            error_kind: Some("timeout".to_string()),
        };
        let success = PingSample {
            status: PingStatus::Success,
            latency_ms: Some(2.0),
            error_kind: None,
            ..timeout.clone()
        };

        assert!(!tracker.record(&timeout).alerting);
        assert!(!tracker.record(&timeout).alerting);
        assert!(tracker.record(&timeout).alerting);
        assert!(!tracker.record(&success).alerting);
    }
}
```

- [ ] **Step 4: Export scheduler module**

Update the top of `src-tauri/src/lib.rs`:

```rust
pub mod config;
pub mod error;
pub mod models;
pub mod ping;
pub mod scheduler;
pub mod storage;
```

- [ ] **Step 5: Run scheduler tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml scheduler
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src-tauri/src/scheduler.rs src-tauri/src/lib.rs
git commit -m "feat: add ping scheduler state"
```

## Task 7: Implement Tauri Commands

**Files:**

- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add command payloads and app state**

Create `src-tauri/src/commands.rs`:

```rust
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::config::ConfigStore;
use crate::error::{AppError, CommandError, CommandResult};
use crate::models::{is_valid_ipv4, AppSettings, PingSample, Target};
use crate::scheduler::{Scheduler, SchedulerConfig};
use crate::storage::Storage;

pub struct AppState {
    pub storage: Storage,
    pub config: ConfigStore,
    pub scheduler: Mutex<Option<Scheduler>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub ping_running: bool,
    pub settings: AppSettings,
    pub targets: Vec<Target>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTargetPayload {
    pub id: Option<Uuid>,
    pub ipv4: String,
    pub alias: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SamplesQuery {
    pub target_id: Uuid,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenHistoryPayload {
    pub path: String,
    pub targets: Vec<Target>,
}
```

- [ ] **Step 2: Add command functions**

Append to `src-tauri/src/commands.rs`:

```rust
#[tauri::command]
pub fn bootstrap(state: State<'_, AppState>) -> CommandResult<BootstrapPayload> {
    let settings = state.config.load().map_err(CommandError::from)?;
    let targets = state.storage.list_targets().map_err(CommandError::from)?;
    Ok(BootstrapPayload { settings, targets })
}

#[tauri::command]
pub fn save_settings(settings: AppSettings, state: State<'_, AppState>) -> CommandResult<AppSettings> {
    state.config.save(&settings).map_err(CommandError::from)?;
    reload_scheduler(&state, settings.clone()).map_err(CommandError::from)?;
    Ok(settings)
}

#[tauri::command]
pub fn save_target(payload: SaveTargetPayload, state: State<'_, AppState>) -> CommandResult<Target> {
    if !is_valid_ipv4(&payload.ipv4) {
        return Err(CommandError::from(AppError::InvalidIpv4));
    }

    let now = Utc::now();
    let target = Target {
        id: payload.id.unwrap_or_else(Uuid::new_v4),
        ipv4: payload.ipv4,
        alias: payload.alias,
        enabled: payload.enabled,
        created_at: now,
        updated_at: now,
    };
    state.storage.upsert_target(&target).map_err(CommandError::from)?;
    let settings = state.config.load().map_err(CommandError::from)?;
    reload_scheduler(&state, settings).map_err(CommandError::from)?;
    Ok(target)
}

#[tauri::command]
pub fn delete_target(id: Uuid, state: State<'_, AppState>) -> CommandResult<()> {
    state.storage.delete_target(id).map_err(CommandError::from)?;
    let settings = state.config.load().map_err(CommandError::from)?;
    reload_scheduler(&state, settings).map_err(CommandError::from)?;
    Ok(())
}

#[tauri::command]
pub fn samples(query: SamplesQuery, state: State<'_, AppState>) -> CommandResult<Vec<PingSample>> {
    state
        .storage
        .samples_for_target(query.target_id, query.from, query.to)
        .map_err(CommandError::from)
}

#[tauri::command]
pub fn open_history_file(path: String) -> CommandResult<OpenHistoryPayload> {
    let storage = Storage::open(PathBuf::from(&path)).map_err(CommandError::from)?;
    let targets = storage.list_targets().map_err(CommandError::from)?;
    Ok(OpenHistoryPayload { path, targets })
}

fn reload_scheduler(state: &State<'_, AppState>, settings: AppSettings) -> Result<(), AppError> {
    let targets = state.storage.list_targets()?;
    let scheduler_guard = state.scheduler.lock().map_err(|error| AppError::Config(error.to_string()))?;
    if let Some(scheduler) = scheduler_guard.as_ref() {
        scheduler.update(SchedulerConfig { settings, targets });
    }
    Ok(())
}
```

- [ ] **Step 3: Wire app state and command handlers**

Replace `src-tauri/src/lib.rs` with:

```rust
pub mod commands;
pub mod config;
pub mod error;
pub mod models;
pub mod ping;
pub mod scheduler;
pub mod storage;

use std::sync::Mutex;

use commands::AppState;
use config::ConfigStore;
use scheduler::{Scheduler, SchedulerConfig};
use storage::Storage;
use tauri::{Emitter, Manager};

fn app_data_dir(handle: &tauri::AppHandle) -> std::path::PathBuf {
    handle
        .path()
        .app_data_dir()
        .expect("app data directory is available")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_dir = app_data_dir(app.handle());
            std::fs::create_dir_all(&app_dir)?;
            let storage = Storage::open(app_dir.join("pingo.sqlite"))?;
            let config = ConfigStore::open(&app_dir)?;
            let settings = config.load()?;
            let targets = storage.list_targets()?;
            let scheduler = Scheduler::new(storage.clone(), SchedulerConfig { settings, targets });
            let app_handle = app.handle().clone();
            scheduler.start(move |sample, alert| {
                let _ = app_handle.emit("ping-sample", (&sample, &alert));
            });
            app.manage(AppState {
                storage,
                config,
                scheduler: Mutex::new(Some(scheduler)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::save_settings,
            commands::save_target,
            commands::delete_target,
            commands::samples,
            commands::open_history_file
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Pingo");
}
```

- [ ] **Step 4: Run Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: expose Pingo Tauri commands"
```

## Task 8: Add Frontend Types, API Wrappers, And Store

**Files:**

- Create: `src/types.ts`
- Create: `src/api/tauri.ts`
- Create: `src/state/usePingoStore.ts`
- Create: `src/__tests__/store.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add test scripts**

Ensure `package.json` contains:

```json
{
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 1420",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Add frontend shared types**

Create `src/types.ts`:

```ts
export type PingStatus = "success" | "timeout" | "error";

export interface AppSettings {
  pingIntervalSeconds: number;
  pingTimeoutSeconds: number;
  retentionDays: number;
  alertThreshold: number;
}

export interface Target {
  id: string;
  ipv4: string;
  alias: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PingSample {
  id: string;
  targetId: string;
  sentAt: string;
  status: PingStatus;
  latencyMs: number | null;
  errorKind: string | null;
}

export interface AlertState {
  targetId: string;
  consecutiveTimeouts: number;
  alerting: boolean;
}

export interface TargetStatus {
  target: Target;
  latestSample: PingSample | null;
  samples: PingSample[];
  consecutiveTimeouts: number;
  alerting: boolean;
}

export interface BootstrapPayload {
  settings: AppSettings;
  targets: Target[];
  pingRunning: boolean;
}

export interface SaveTargetPayload {
  id?: string;
  ipv4: string;
  alias: string;
  enabled: boolean;
}
```

- [ ] **Step 3: Add Tauri API wrapper**

Create `src/api/tauri.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AlertState,
  AppSettings,
  BootstrapPayload,
  PingSample,
  SaveTargetPayload,
  Target,
} from "../types";

export function bootstrap() {
  return invoke<BootstrapPayload>("bootstrap");
}

export function saveSettings(settings: AppSettings) {
  return invoke<AppSettings>("save_settings", { settings });
}

export function saveTarget(payload: SaveTargetPayload) {
  return invoke<Target>("save_target", { payload });
}

export function setTargetEnabled(id: string, enabled: boolean) {
  return invoke<Target>("set_target_enabled", { id, enabled });
}

export function startPing() {
  return invoke<void>("start_ping");
}

export function stopPing() {
  return invoke<void>("stop_ping");
}

export function deleteTarget(id: string) {
  return invoke<void>("delete_target", { id });
}

export function loadSamples(targetId: string, from?: string, to?: string) {
  return invoke<PingSample[]>("samples", {
    query: { targetId, from: from ?? null, to: to ?? null },
  });
}

export function openHistoryFile(path: string) {
  return invoke<{ path: string; targets: Target[] }>("open_history_file", { path });
}

export function onPingSample(callback: (sample: PingSample, alert: AlertState) => void) {
  return listen<[PingSample, AlertState]>("ping-sample", (event) => {
    const [sample, alert] = event.payload;
    callback(sample, alert);
  });
}
```

- [ ] **Step 4: Add store tests**

Create `src/__tests__/store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AlertState, PingSample, TargetStatus } from "../types";
import { applyPingSample, createTargetStatus } from "../state/usePingoStore";

describe("Pingo store helpers", () => {
  it("appends samples and updates alert state", () => {
    const target = {
      id: "target-1",
      ipv4: "192.168.1.1",
      alias: "Router",
      enabled: true,
      createdAt: "2026-06-18T00:00:00Z",
      updatedAt: "2026-06-18T00:00:00Z",
    };
    const status: TargetStatus = createTargetStatus(target);
    const sample: PingSample = {
      id: "sample-1",
      targetId: "target-1",
      sentAt: "2026-06-18T00:00:05Z",
      status: "timeout",
      latencyMs: null,
      errorKind: "timeout",
    };
    const alert: AlertState = {
      targetId: "target-1",
      consecutiveTimeouts: 3,
      alerting: true,
    };

    const next = applyPingSample(status, sample, alert);

    expect(next.latestSample).toEqual(sample);
    expect(next.samples).toEqual([sample]);
    expect(next.consecutiveTimeouts).toBe(3);
    expect(next.alerting).toBe(true);
  });
});
```

- [ ] **Step 5: Implement store helpers**

Create `src/state/usePingoStore.ts`:

```ts
import type { AlertState, PingSample, Target, TargetStatus } from "../types";

export function createTargetStatus(target: Target): TargetStatus {
  return {
    target,
    latestSample: null,
    samples: [],
    consecutiveTimeouts: 0,
    alerting: false,
  };
}

export function applyPingSample(
  status: TargetStatus,
  sample: PingSample,
  alert: AlertState,
): TargetStatus {
  const samples = [...status.samples, sample].slice(-120);
  return {
    ...status,
    latestSample: sample,
    samples,
    consecutiveTimeouts: alert.consecutiveTimeouts,
    alerting: alert.alerting,
  };
}
```

- [ ] **Step 6: Run frontend tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add package.json package-lock.json src/types.ts src/api src/state src/__tests__
git commit -m "feat: add frontend Pingo state primitives"
```

## Task 9: Build Overview Dashboard UI

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/components/Toolbar.tsx`
- Create: `src/components/TargetGrid.tsx`
- Create: `src/components/TargetCard.tsx`
- Create: `src/components/TargetEditor.tsx`
- Create: `src/components/SettingsPanel.tsx`

- [ ] **Step 1: Add mini chart component**


```tsx
import type { PingSample } from "../types";

export function TargetCard({
  status,
  selected,
  onSelect,
}: {
  status: TargetStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  const latest = status.latestSample;
  const stateClass = status.alerting ? "alert" : latest?.status ?? "idle";
  const latency = latest?.latencyMs == null ? "--" : `${latest.latencyMs.toFixed(1)} ms`;

  return (
    <button className={`targetCard ${stateClass} ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="targetCardHeader">
        <div>
          <strong>{status.target.alias}</strong>
          <span>{status.target.ipv4}</span>
        </div>
        <b>{latency}</b>
      </div>
      <div className="targetMeta">
        <span>{latest?.status ?? "waiting"}</span>
        <span>{status.consecutiveTimeouts} timeouts</span>
      </div>
    </button>
  );
}
```

- [ ] **Step 3: Add grid and toolbar**

Create `src/components/TargetGrid.tsx`:

```tsx
import type { TargetStatus } from "../types";
import { TargetCard } from "./TargetCard";

export function TargetGrid({
  targets,
  selectedTargetId,
  onSelect,
}: {
  targets: TargetStatus[];
  selectedTargetId: string | null;
  onSelect: (targetId: string) => void;
}) {
  if (targets.length === 0) {
    return <section className="emptyState">Add an IPv4 target to start monitoring.</section>;
  }

  return (
    <section className="targetGrid">
      {targets.map((status) => (
        <TargetCard
          key={status.target.id}
          status={status}
          selected={status.target.id === selectedTargetId}
          onSelect={() => onSelect(status.target.id)}
        />
      ))}
    </section>
  );
}
```

Create `src/components/Toolbar.tsx`:

```tsx
export function Toolbar({
  onAddTarget,
  onOpenHistory,
  onReturnLive,
  onOpenSettings,
  historyMode,
}: {
  onAddTarget: () => void;
  onOpenHistory: () => void;
  onReturnLive: () => void;
  onOpenSettings: () => void;
  historyMode: boolean;
}) {
  return (
    <header className="topBar">
      <div>
        <h1>Pingo</h1>
        <p>{historyMode ? "Historical data file" : "Live IPv4 latency monitor"}</p>
      </div>
      <div className="toolbarActions">
        <button onClick={onAddTarget} disabled={historyMode}>Add</button>
        <button onClick={onOpenHistory}>Open File</button>
        <button onClick={onReturnLive} disabled={!historyMode}>Live</button>
        <button onClick={onOpenSettings} disabled={historyMode}>Settings</button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Add target editor and settings panel**

Create `src/components/TargetEditor.tsx`:

```tsx
import { useState } from "react";
import type { SaveTargetPayload } from "../types";

export function TargetEditor({
  onSave,
  onClose,
}: {
  onSave: (payload: SaveTargetPayload) => void;
  onClose: () => void;
}) {
  const [ipv4, setIpv4] = useState("");
  const [alias, setAlias] = useState("");

  return (
    <form className="panel" onSubmit={(event) => {
      event.preventDefault();
      onSave({ ipv4, alias: alias || ipv4 });
    }}>
      <h2>Add target</h2>
      <label>
        IPv4
        <input value={ipv4} onChange={(event) => setIpv4(event.target.value)} placeholder="192.168.1.1" />
      </label>
      <label>
        Alias
        <input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="Router" />
      </label>
      <div className="panelActions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}
```

Create `src/components/SettingsPanel.tsx`:

```tsx
import { useState } from "react";
import type { AppSettings } from "../types";

export function SettingsPanel({
  settings,
  onSave,
  onClose,
}: {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  const setNumber = (key: keyof AppSettings, value: string) => {
    setDraft({ ...draft, [key]: Number(value) });
  };

  return (
    <form className="panel" onSubmit={(event) => {
      event.preventDefault();
      onSave(draft);
    }}>
      <h2>Settings</h2>
      <label>
        Ping interval seconds
        <input type="number" min="1" value={draft.pingIntervalSeconds} onChange={(event) => setNumber("pingIntervalSeconds", event.target.value)} />
      </label>
      <label>
        Ping timeout seconds
        <input type="number" min="1" value={draft.pingTimeoutSeconds} onChange={(event) => setNumber("pingTimeoutSeconds", event.target.value)} />
      </label>
      <label>
        Retention days
        <input type="number" min="1" value={draft.retentionDays} onChange={(event) => setNumber("retentionDays", event.target.value)} />
      </label>
      <label>
        Alert threshold
        <input type="number" min="1" value={draft.alertThreshold} onChange={(event) => setNumber("alertThreshold", event.target.value)} />
      </label>
      <div className="panelActions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Compose dashboard in App**

Replace `src/App.tsx` with:

```tsx
import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import "./styles.css";
import { bootstrap, onPingSample, openHistoryFile, saveSettings, saveTarget, setTargetEnabled, startPing, stopPing } from "./api/tauri";
import { SettingsPanel } from "./components/SettingsPanel";
import { TargetEditor } from "./components/TargetEditor";
import { TargetGrid } from "./components/TargetGrid";
import { Toolbar } from "./components/Toolbar";
import { applyPingSample, createTargetStatus } from "./state/usePingoStore";
import type { AppSettings, TargetStatus } from "./types";

const defaultSettings: AppSettings = {
  pingIntervalSeconds: 5,
  pingTimeoutSeconds: 5,
  retentionDays: 7,
  alertThreshold: 3,
};

export default function App() {
  const [settings, setSettings] = useState(defaultSettings);
  const [targets, setTargets] = useState<TargetStatus[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);
  const [pingRunning, setPingRunning] = useState(false);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    bootstrap().then((payload) => {
      setSettings(payload.settings);
      setTargets(payload.targets.map(createTargetStatus));
      setPingRunning(payload.pingRunning);
    });
    onPingSample((sample, alert) => {
      setTargets((current) =>
        current.map((status) =>
          status.target.id === sample.targetId ? applyPingSample(status, sample, alert) : status,
        ),
      );
    }).then((unlisten) => {
      cleanup = unlisten;
    });
    return () => {
      cleanup?.();
    };
  }, []);

  const selectedTarget = useMemo(
    () => targets.find((status) => status.target.id === selectedTargetId) ?? null,
    [targets, selectedTargetId],
  );

  return (
    <main className="appShell">
      <Toolbar
        historyMode={historyMode}
        pingRunning={pingRunning}
        onAddTarget={() => setShowEditor(true)}
        onOpenSettings={() => setShowSettings(true)}
        onReturnLive={() => window.location.reload()}
        onStartPing={async () => { await startPing(); setPingRunning(true); }}
        onStopPing={async () => { await stopPing(); setPingRunning(false); }}
        onOpenHistory={async () => {
          const path = await open({ multiple: false, directory: false });
          if (typeof path === "string") {
            const payload = await openHistoryFile(path);
            setHistoryMode(true);
            setTargets(payload.targets.map(createTargetStatus));
            setSelectedTargetId(null);
          }
        }}
      />
      <TargetGrid targets={targets} selectedTargetId={selectedTargetId} onSelect={setSelectedTargetId} onToggleEnabled={async (id) => { const t = await setTargetEnabled(id); setTargets((current) => current.map((s) => s.target.id === t.id ? createTargetStatus(t) : s)); }} />
      {selectedTarget ? <section className="detailShell">{selectedTarget.target.alias}</section> : null}
      {showEditor ? (
        <TargetEditor
          onClose={() => setShowEditor(false)}
          onSave={async (payload) => {
            const target = await saveTarget(payload);
            setTargets((current) => [...current, createTargetStatus(target)]);
            setShowEditor(false);
          }}
        />
      ) : null}
      {showSettings ? (
        <SettingsPanel
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={async (next) => {
            const saved = await saveSettings(next);
            setSettings(saved);
            setShowSettings(false);
          }}
        />
      ) : null}
    </main>
  );
}
```

- [ ] **Step 6: Add dashboard styles**

Append to `src/styles.css`:

```css
.toolbarActions {
  display: flex;
  gap: 8px;
}

.toolbarActions button,
.panelActions button {
  min-width: 80px;
  height: 34px;
  border: 1px solid #c8d2df;
  border-radius: 6px;
  background: #ffffff;
  color: #243447;
}

.toolbarActions button:disabled {
  color: #99a5b4;
  background: #eef2f6;
}

.targetGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
  padding: 18px;
}

.targetCard {
  padding: 14px;
  border: 1px solid #d8e0e8;
  border-radius: 8px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.targetCardBody {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.targetCard.alert {
  border-color: #dc2626;
  background: #fff5f5;
}

.targetCardHeader,
.targetMeta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.targetCardHeader strong,
.targetCardHeader span {
  display: block;
}

.targetCardHeader span,
.targetMeta {
  color: #65758b;
  font-size: 12px;
}

.targetStats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.targetStats span {
  padding: 4px 6px;
  border: 1px solid #d8e0e8;
  border-radius: 4px;
  font-size: 11px;
  color: #405166;
  background: #f8fafc;
}

.targetCardFooter {
  display: flex;
  gap: 6px;
  justify-content: end;
}

.targetCardFooter button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #c8d2df;
  border-radius: 4px;
  background: #ffffff;
  color: #243447;
  font-size: 12px;
}

.targetCardFooter button.detailBtn {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
}

.detailShell,
.panel {
  margin: 0 18px 18px;
  padding: 18px;
  border: 1px solid #d8e0e8;
  border-radius: 8px;
  background: #ffffff;
}

.panel {
  position: fixed;
  right: 24px;
  top: 88px;
  width: 320px;
  display: grid;
  gap: 12px;
  box-shadow: 0 18px 48px rgba(31, 41, 55, 0.18);
}

.panel label {
  display: grid;
  gap: 6px;
  color: #405166;
  font-size: 13px;
}

.panel input {
  height: 34px;
  border: 1px solid #c8d2df;
  border-radius: 6px;
  padding: 0 10px;
}

.panelActions {
  display: flex;
  justify-content: end;
  gap: 8px;
}
```

- [ ] **Step 7: Build frontend**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/App.tsx src/styles.css src/components
git commit -m "feat: build overview dashboard"
```

## Task 10: Add Detail Chart With Zoom And Pan

**Files:**

- Create: `src/components/LatencyChart.tsx`
- Create: `src/components/DetailPanel.tsx`
- Modify: `src/App.tsx`
- Create: `src/__tests__/charts.test.tsx`

- [ ] **Step 1: Add chart test**

Create `src/__tests__/charts.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DetailPanel } from "../components/DetailPanel";
import type { TargetStatus } from "../types";

describe("DetailPanel", () => {
  it("shows statistics for selected target", () => {
    const status: TargetStatus = {
      target: {
        id: "target-1",
        ipv4: "192.168.1.1",
        alias: "Router",
        enabled: true,
        createdAt: "2026-06-18T00:00:00Z",
        updatedAt: "2026-06-18T00:00:00Z",
      },
      latestSample: null,
      consecutiveTimeouts: 1,
      alerting: false,
      samples: [
        {
          id: "sample-1",
          targetId: "target-1",
          sentAt: "2026-06-18T00:00:00Z",
          status: "success",
          latencyMs: 10,
          errorKind: null,
        },
        {
          id: "sample-2",
          targetId: "target-1",
          sentAt: "2026-06-18T00:00:05Z",
          status: "timeout",
          latencyMs: null,
          errorKind: "timeout",
        },
      ],
    };

    render(<DetailPanel status={status} />);

    expect(screen.getByText("Router")).toBeTruthy();
    expect(screen.getByText("Average 10.0 ms")).toBeTruthy();
    expect(screen.getByText("Timeouts 1")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- --run src/__tests__/charts.test.tsx
```

Expected: FAIL because `DetailPanel` does not exist.

- [ ] **Step 3: Add detail chart components**

Create `src/components/LatencyChart.tsx`:

```tsx
import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { PingSample } from "../types";

export function LatencyChart({ samples }: { samples: PingSample[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const successful = samples.filter((sample) => sample.status === "success" && sample.latencyMs != null);
    const data: uPlot.AlignedData = [
      successful.map((sample) => new Date(sample.sentAt).getTime() / 1000),
      successful.map((sample) => sample.latencyMs as number),
    ];
    const chart = new uPlot(
      {
        width: hostRef.current.clientWidth || 720,
        height: 280,
        scales: { x: { time: true } },
        axes: [{}, { label: "ms" }],
        series: [{}, { label: "Latency", stroke: "#2563eb", width: 2 }],
        cursor: { drag: { x: true, y: false } },
      },
      data,
      hostRef.current,
    );
    return () => chart.destroy();
  }, [samples]);

  return <div className="latencyChart" ref={hostRef} />;
}
```

Create `src/components/DetailPanel.tsx`:

```tsx
import type { TargetStatus } from "../types";
import { LatencyChart } from "./LatencyChart";

export function DetailPanel({ status }: { status: TargetStatus }) {
  const successes = status.samples.filter((sample) => sample.status === "success" && sample.latencyMs != null);
  const timeoutCount = status.samples.filter((sample) => sample.status === "timeout").length;
  const average = successes.length
    ? successes.reduce((sum, sample) => sum + (sample.latencyMs ?? 0), 0) / successes.length
    : 0;
  const max = successes.length ? Math.max(...successes.map((sample) => sample.latencyMs ?? 0)) : 0;

  return (
    <section className="detailShell">
      <div className="detailHeader">
        <div>
          <h2>{status.target.alias}</h2>
          <p>{status.target.ipv4}</p>
        </div>
        <div className="statRow">
          <span>Average {average.toFixed(1)} ms</span>
          <span>Max {max.toFixed(1)} ms</span>
          <span>Timeouts {timeoutCount}</span>
        </div>
      </div>
      <LatencyChart samples={status.samples} />
    </section>
  );
}
```

- [ ] **Step 4: Replace detail shell in App**

Change the detail render in `src/App.tsx`:

```tsx
import { DetailPanel } from "./components/DetailPanel";
```

Replace:

```tsx
{selectedTarget ? <section className="detailShell">{selectedTarget.target.alias}</section> : null}
```

with:

```tsx
{selectedTarget ? <DetailPanel status={selectedTarget} /> : null}
```

- [ ] **Step 5: Add chart styles**

Append to `src/styles.css`:

```css
.detailHeader {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.detailHeader h2 {
  margin: 0;
  font-size: 18px;
}

.detailHeader p {
  margin: 4px 0 0;
  color: #65758b;
}

.statRow {
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: 8px;
}

.statRow span {
  padding: 6px 8px;
  border: 1px solid #d8e0e8;
  border-radius: 6px;
  font-size: 12px;
  color: #405166;
  background: #f8fafc;
}

.latencyChart {
  width: 100%;
  min-height: 280px;
}
```

- [ ] **Step 6: Run frontend tests and build**

Run:

```bash
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/App.tsx src/styles.css src/components/LatencyChart.tsx src/components/DetailPanel.tsx src/__tests__/charts.test.tsx
git commit -m "feat: add target detail chart"
```

## Task 11: Load Samples For History Mode And Selected Targets

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/api/tauri.ts`

- [ ] **Step 1: Load selected target samples**

In `src/App.tsx`, add this effect after the event subscription effect:

```tsx
useEffect(() => {
  if (!selectedTargetId) return;
  loadSamples(selectedTargetId).then((samples) => {
    setTargets((current) =>
      current.map((status) =>
        status.target.id === selectedTargetId
          ? { ...status, samples, latestSample: samples[samples.length - 1] ?? status.latestSample }
          : status,
      ),
    );
  });
}, [selectedTargetId]);
```

Add this import:

```tsx
import { bootstrap, loadSamples, onPingSample, openHistoryFile, saveSettings, saveTarget } from "./api/tauri";
```

- [ ] **Step 2: Build frontend**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add src/App.tsx src/api/tauri.ts
git commit -m "feat: load samples for selected target"
```

## Task 12: Support Read-Only External History Files

**Files:**

- Modify: `src-tauri/src/commands.rs`
- Modify: `src/App.tsx`
- Modify: `src/api/tauri.ts`

- [ ] **Step 1: Add backend command for external samples**

Append to `src-tauri/src/commands.rs`:

```rust
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySamplesQuery {
    pub path: String,
    pub target_id: Uuid,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
}

#[tauri::command]
pub fn history_samples(query: HistorySamplesQuery) -> CommandResult<Vec<PingSample>> {
    let storage = Storage::open(PathBuf::from(&query.path)).map_err(CommandError::from)?;
    storage
        .samples_for_target(query.target_id, query.from, query.to)
        .map_err(CommandError::from)
}
```

Replace the `invoke_handler` block in `src-tauri/src/lib.rs` with:

```rust
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::save_settings,
            commands::save_target,
            commands::delete_target,
            commands::samples,
            commands::open_history_file,
            commands::history_samples
        ])
```

- [ ] **Step 2: Add frontend wrapper**

Append to `src/api/tauri.ts`:

```ts
export function loadHistorySamples(path: string, targetId: string, from?: string, to?: string) {
  return invoke<PingSample[]>("history_samples", {
    query: { path, targetId, from: from ?? null, to: to ?? null },
  });
}
```

- [ ] **Step 3: Track history file path in App**

In `src/App.tsx`, add state:

```tsx
const [historyPath, setHistoryPath] = useState<string | null>(null);
```

When opening history, set the path:

```tsx
setHistoryPath(payload.path);
```

Change selected target sample loading:

```tsx
useEffect(() => {
  if (!selectedTargetId) return;
  const loader = historyMode && historyPath
    ? loadHistorySamples(historyPath, selectedTargetId)
    : loadSamples(selectedTargetId);
  loader.then((samples) => {
    setTargets((current) =>
      current.map((status) =>
        status.target.id === selectedTargetId
          ? { ...status, samples, latestSample: samples[samples.length - 1] ?? status.latestSample }
          : status,
      ),
    );
  });
}, [historyMode, historyPath, selectedTargetId]);
```

Use this API import in `src/App.tsx`:

```tsx
import {
  bootstrap,
  loadHistorySamples,
  loadSamples,
  onPingSample,
  openHistoryFile,
  saveSettings,
  saveTarget,
} from "./api/tauri";
```

- [ ] **Step 4: Run full tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs src/api/tauri.ts src/App.tsx
git commit -m "feat: browse external history files"
```

## Task 13: Polish Validation, Empty States, And User-Facing Errors

**Files:**

- Modify: `src/components/TargetEditor.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add IPv4 validation helper**

Create `src/validation.ts`:

```ts
export function isValidIpv4(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}
```

- [ ] **Step 2: Validate target editor before save**

Modify `src/components/TargetEditor.tsx` to import `isValidIpv4`, add local error state, and guard submit:

```tsx
import { isValidIpv4 } from "../validation";
```

Inside the component:

```tsx
const [error, setError] = useState<string | null>(null);
```

Replace the form submit body with:

```tsx
event.preventDefault();
if (!isValidIpv4(ipv4)) {
  setError("Only IPv4 addresses are supported in this version.");
  return;
}
onSave({ ipv4, alias: alias || ipv4 });
```

Render before `.panelActions`:

```tsx
{error ? <p className="formError">{error}</p> : null}
```

- [ ] **Step 3: Show command errors in App**

In `src/App.tsx`, add:

```tsx
const [appError, setAppError] = useState<string | null>(null);
```

Render after `Toolbar`:

```tsx
{appError ? <div className="appError">{appError}</div> : null}
```

Wrap async calls with `try/catch` and set:

```tsx
setAppError(error instanceof Error ? error.message : "The operation could not be completed.");
```

- [ ] **Step 4: Add error styles**

Append to `src/styles.css`:

```css
.appError,
.formError {
  color: #991b1b;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 6px;
}

.appError {
  margin: 14px 18px 0;
  padding: 10px 12px;
}

.formError {
  margin: 0;
  padding: 8px 10px;
  font-size: 13px;
}
```

- [ ] **Step 5: Run frontend build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/App.tsx src/components/TargetEditor.tsx src/styles.css src/validation.ts
git commit -m "feat: improve validation and error messages"
```

## Task 14: End-To-End Verification And Packaging Check

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Run all automated checks**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 2: Run app locally**

Run:

```bash
npm run tauri dev
```

Manual verification:

```text
The app window opens.
Add target 127.0.0.1 with alias Localhost.
The target appears in the overview grid.
After the next interval, the latest sample updates.
Selecting the target shows the detail chart.
Settings can change interval, timeout, retention, and alert threshold.
Opening an invalid IPv4 address shows the IPv4-only message.
```

- [ ] **Step 3: Build distributable bundle**

Run:

```bash
npm run tauri build
```

Expected: Tauri produces platform bundle output under `src-tauri/target/release/bundle`.

- [ ] **Step 4: Update README with verification notes**

Append to `README.md`:

```markdown
## Manual Verification

Before a release, verify:

- Add `127.0.0.1` as `Localhost`.
- Confirm the overview card receives samples.
- Select the card and confirm the detail chart renders.
- Change ping interval and timeout in settings.
- Open a saved Pingo data file and confirm it is viewed as history.
- Build the platform bundle with `npm run tauri build`.
```

- [ ] **Step 5: Commit**

Run:

```bash
git add README.md
git commit -m "docs: add release verification checklist"
```

## Self-Review Checklist

- Spec coverage:
  - macOS and Windows support is covered by Tauri scaffold, system ping command adapters, and release checks.
  - IPv4-only target management is covered by Rust and frontend validation.
  - Configurable interval, timeout, retention, and alert threshold are covered by settings models, config persistence, commands, and settings UI.
  - SQLite default data file and read-only external history browsing are covered by storage and history-file tasks.
  - Overview-first dashboard showing IP, alias, avg latency, sent count, timeouts, timeout rate, and enable/disable toggle per target is covered by dashboard task.
  - In-app alert state is covered by scheduler alert tracking and target card state styling.
- Global ping start/stop control is covered by scheduler state and toolbar implementation.
- Only enabled targets pinged when global ping is active is covered by scheduler task.
- Placeholder scan:
  - No deferred implementation markers are intended in this plan.
- Type consistency:
  - Frontend camelCase payload names match Rust serde `rename_all = "camelCase"`.
  - `Target`, `PingSample`, `AppSettings`, and alert payloads are defined before later tasks use them.
  - Tauri command names used by `src/api/tauri.ts` match the Rust command function names.
