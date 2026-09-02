# Pingo Design

Date: 2026-06-18

## Goal

Pingo is a distributable desktop monitoring tool built with Tauri and Rust. It checks the reachability of a configurable set of IPv4 addresses, records each ping result, and shows latency history with interactive bar charts.

The first release targets macOS and Windows. It should work as a normal desktop app for non-developer users.

## Scope

In scope for the first release:

- macOS and Windows desktop builds.
- IPv4 targets only.
- Manual add, edit, enable, disable, and delete for targets.
- A user-facing alias for each target.
- Global ping start/stop control.
- Global ping interval and ping timeout settings.
- Default ping interval of 5 seconds.
- Default ping timeout of 5 seconds.
- Local SQLite-backed data files.
- Automatic default data file management in the app data directory.
- Opening external data files for read-only historical browsing.
- Configurable history retention, defaulting to 7 days.
- In-app alert state when a target times out repeatedly.
- Overview-first dashboard showing IP, alias, average latency, total pings sent, timeout count, timeout rate, and an enable/disable toggle per target.
- Detail view for one selected target with zoom, pan, and time-axis navigation.

Out of scope for the first release:

- IPv6 and domain or hostname targets.
- Batch import.
- Target groups or tags.
- CSV, image, or PDF export.
- System notifications.
- Writing to external data files selected for historical viewing.

## Architecture

The app uses Tauri as the desktop shell. Rust owns ping execution, scheduling, configuration, persistence, and the API surface exposed to the frontend. The frontend owns target management UI, chart rendering, settings, and interactive exploration of history.

Backend modules:

- `ping`: platform-specific adapters for macOS and Windows. Each adapter calls the system `ping` command and parses its output into a shared result type.
- `scheduler`: coordinates periodic ping runs for all enabled targets using the current global interval and timeout settings, only when global ping is active.
- `storage`: reads and writes SQLite data files, including the default active monitoring file and read-only external history files.
- `config`: persists user settings such as target list, aliases, interval, timeout, retention period, and alert threshold.
- `commands`: Tauri commands for querying and mutating targets, settings, and historical data.
- `events`: realtime result events emitted from Rust to the frontend after each ping sample.

The recommended implementation approach is system `ping` plus SQLite. This avoids raw ICMP permission problems for a distributable desktop app while keeping historical queries and retention cleanup efficient.

## Data Model

The SQLite file stores monitoring history and target metadata.

`targets`:

- `id`: stable target identifier.
- `ipv4`: IPv4 address string.
- `alias`: user-facing name.
- `enabled`: whether this target participates in pinging (only takes effect when global ping is active).
- `created_at`: creation timestamp.
- `updated_at`: last update timestamp.

`ping_samples`:

- `id`: sample identifier.
- `target_id`: associated target.
- `sent_at`: timestamp for the ping attempt.
- `status`: success, timeout, or error.
- `latency_ms`: measured latency for successful attempts.
- `error_kind`: normalized error category for failed attempts.

The default active data file is stored in the application data directory. The app also lets users open an external data file for read-only viewing. External files are not written to in the first release.

## Runtime Behavior

On startup, the app loads settings and the default active data file. Ping starts in stopped state. When the user clicks "Start Ping", the scheduler begins pinging all enabled targets; "Stop Ping" halts all ping operations. Each ping result is written to the active SQLite file and emitted to the frontend.

A target is only pinged when both conditions are met: global ping is active AND the target is enabled. Disabling a target does not delete its history.

When a user changes targets or settings, the frontend calls a Tauri command. The backend persists the change and reloads the scheduler configuration without requiring an app restart.

Deleting a target stops future samples for that target. Existing history remains in the data file so past results can still be viewed.

Retention cleanup removes samples older than the configured retention period. The default retention period is 7 days.

Alerting is in-app only. A target enters alert state after consecutive timeout results reach the configured threshold. The default threshold is 3 consecutive timeouts. Alert state is shown visually in the dashboard, such as a red status treatment and message.

## User Interface

The primary layout is overview first.

Top toolbar:

- Add target.
- Open data file.
- Return to current monitoring file.
- Settings.
- Start Ping / Stop Ping (toggle based on current state).

Overview dashboard:

- Targets are displayed as a grid of cards.
- Each card shows the IPv4 address, alias, and statistics: average latency, total pings sent, timeout count, and timeout rate.
- Each card includes an enable/disable toggle. Only enabled targets are pinged when global ping is active.
- Normal, timeout, and alert states are visually distinct.

Detail view:

- Selecting a target opens or expands a larger bar chart for that target.
- The detail chart supports zoom, pan, and time-axis movement.
- The detail area shows basic statistics such as average latency, maximum latency, and timeout count for the visible range.

Settings panel:

- Ping interval in seconds, default 5.
- Ping timeout in seconds, default 5.
- History retention in days, default 7.
- Consecutive timeout alert threshold, default 3.

Target editor:

- IPv4 address.
- Alias.

## Error Handling

User-facing errors should be understandable without developer knowledge.

Examples:

- Invalid IPv4 address: explain that only IPv4 is supported in the first release.
- Ping command failure: show that the target could not be checked and keep the scheduler running for other targets.
- Data file open failure: explain that the file could not be opened or is not a supported Pingo data file.
- Storage write failure: show an app-level warning because monitoring history may not be saved.

Backend errors should be normalized before crossing into the frontend so the UI does not depend on platform-specific command output.

## Testing Strategy

Rust tests:

- Parse representative macOS `ping` output.
- Parse representative Windows `ping` output.
- Normalize success, timeout, and error cases.
- Write and read ping samples from SQLite.
- Query samples by target and time range.
- Clean up samples older than the configured retention period.
- Reload scheduler state after target or settings changes.

Frontend and integration checks:

- Add, edit, disable, and delete targets.
- Show realtime ping result updates in the overview grid.
- Open a historical data file in read-only mode.
- Return from a historical file to the active monitoring file.
- Zoom and pan the detail chart.
- Show in-app alert state after the configured consecutive timeout threshold.

Manual release checks:

- Run on macOS.
- Run on Windows.
- Verify bundled app behavior with normal user permissions.

## Future Extensions

The design is intentionally fixed for the first implementation plan. Future versions can add IPv6, hostname support, CSV export, system notifications, batch import, and target grouping after the core app is working.
