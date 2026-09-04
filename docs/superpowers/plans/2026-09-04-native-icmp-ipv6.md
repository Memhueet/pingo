# Windows 原生 ICMP + 并发采样 + IPv6 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows 侧改用 IcmpSendEcho 原生 ICMP、采样并发化、字段改名 address 并支持 IPv6 目标。

**Architecture:** Rust 端 ping 模块按平台分派（Unix 系统 ping / Windows FFI），调度器改为"锁内快照 → JoinSet 并发探测 → 主任务串行落库"三段式；前后端 `ipv4` 字段统一更名为 `address`，SQLite 列与 localStorage 外观键带自动迁移。

**Tech Stack:** Tauri 2、tokio（JoinSet/spawn_blocking）、windows-sys 0.60（`IcmpSendEcho`/`Icmp6SendEcho2`）、rusqlite bundled、React 19 + TS + Vitest。

**Spec:** `docs/superpowers/specs/2026-09-04-native-icmp-ipv6-design.md`

## Global Constraints

- 提交信息中文，`<type>: <摘要>` 格式，多要点写正文；小粒度提交，一笔一个独立改动。
- 注释、文档一律中文。
- 涉及 README.md / AGENTS.md 的改动必须与对应代码同笔提交。
- 前端改动跑 `npm test` + `npm run build`；Rust 改动跑 `cargo test --manifest-path src-tauri/Cargo.toml`；跨端命令改动两套都跑。
- `npm test` 中 uPlot 在 jsdom 下有固有 unhandled error，测试全绿即通过，勿当回归修。
- 不得修改/删除仓库外用户数据文件；SQLite 列迁移只发生在应用自身打开数据文件的逻辑里（有测试覆盖）。
- 每个 Task 结束状态必须可编译、测试全绿，才允许提交。

---

### Task 0: 提交 AGENTS.md 遗留编辑

工作区有一处未提交的 AGENTS.md 编辑（补充"README/AGENTS 同步提交"约定 + 空行），先单独入库，避免混入后续提交。

**Files:**
- Modify: `AGENTS.md`（已有未提交改动，不新增内容）

- [ ] **Step 1: 确认 diff 仅含上述两处编辑**

Run: `git diff AGENTS.md`
Expected: 仅空行增加与提交规范那一行的补充，无其他内容。

- [ ] **Step 2: 提交**

```bash
git add AGENTS.md
git commit -m "docs: AGENTS.md 补充 README/AGENTS 同步提交约定"
```

---

### Task 1: 修正 ping 超时参数单位（Windows/macOS 毫秒，Linux 秒）

**背景：** 系统 ping 的等待参数单位不一——Windows `-w` 与 macOS `-W` 均为毫秒，Linux `-W` 为秒；现实现一律传秒值，导致 Windows/macOS 实际超时仅约 5ms。spec §5 只写了 macOS，实测确认 Windows `-w` 同病，本笔一并修复并在 spec 里补一句。

**Files:**
- Modify: `src-tauri/src/ping/command.rs:11-18`（参数组装抽成按 cfg 分派的纯函数）
- Modify: `docs/superpowers/specs/2026-09-04-native-icmp-ipv6-design.md`（§5 标题与正文补 Windows `-w`）
- Test: `src-tauri/src/ping/command.rs`（同文件 tests 模块）

**Interfaces:**
- Produces: `fn build_ping_args(address: &str, timeout_secs: u64) -> Vec<String>`（`ping_target` 内部调用；Task 4 之后仍保留 Unix 版本）

- [ ] **Step 1: 写失败测试**

在 `command.rs` 的 `mod tests` 中加入（保留现有两个 async 测试不动）：

```rust
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
```

- [ ] **Step 2: 确认测试失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ping_args`
Expected: 编译失败，`build_ping_args` 未定义。

- [ ] **Step 3: 实现**

`command.rs` 顶部函数区加入（放在 `ping_target` 之前），并把 `ping_target` 里的 args 组装替换为调用它：

```rust
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
```

`ping_target` 改为：

```rust
pub async fn ping_target(ipv4: &str, timeout_secs: u64) -> CommandResult<ParsedPing> {
    let mut cmd = Command::new("ping");
    cmd.args(build_ping_args(ipv4, timeout_secs));
    // 仅在 Windows 上使用 creation_flags
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    // ……以下 output/解码/parse 逻辑不变
```

- [ ] **Step 4: 全量测试通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部 PASS（含既有 `ping_localhost_succeeds`；`ping_loopback_timeout_is_safe` 在 macOS 上等待时间变为约 3 秒属正常）。

- [ ] **Step 5: 同步 spec §5**

把 spec 第 5 节标题改为「macOS/Windows 超时参数单位修复」，正文补充一句：实测 Windows `-w` 亦为毫秒、现实现同样误传秒值，随本笔一并修复。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/src/ping/command.rs docs/superpowers/specs/2026-09-04-native-icmp-ipv6-design.md
git commit -m "fix: ping 超时参数按平台传正确单位（Windows/macOS 毫秒、Linux 秒）"
```

---

### Task 2: 采样并发化

**Files:**
- Modify: `src-tauri/src/scheduler.rs`（`start` 的主循环重写为三段式；新增纯函数 `is_due`）

**Interfaces:**
- Consumes: `ping::ping_target(&str, u64)`（Task 4 起改名为 `ping::probe`，本笔不动）
- Produces: `fn is_due(last_ping: DateTime<Utc>, consecutive_timeouts: u32, base_interval: u64, backoff_intervals: &[u64], now: DateTime<Utc>) -> bool`；主循环结构（快照/并发/串行三段），Task 3/4 只替换其中的探测函数与字段名。

- [ ] **Step 1: 写 is_due 的失败测试**

在 `scheduler.rs` 的 `mod tests` 中加入：

```rust
    #[test]
    fn target_due_when_interval_elapsed_exactly() {
        let now = Utc::now();
        assert!(is_due(now - chrono::Duration::seconds(5), 0, 5, &LADDER, now));
    }

    #[test]
    fn target_not_due_before_interval() {
        let now = Utc::now();
        assert!(!is_due(now - chrono::Duration::seconds(4), 0, 5, &LADDER, now));
    }

    #[test]
    fn backoff_ladder_raises_due_bar() {
        let now = Utc::now();
        // 连续失败 6 次后档位为 10s，高于正常间隔 5s
        assert!(!is_due(now - chrono::Duration::seconds(5), 6, 5, &LADDER, now));
        assert!(is_due(now - chrono::Duration::seconds(10), 6, 5, &LADDER, now));
    }
```

- [ ] **Step 2: 确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml scheduler`
Expected: 编译失败，`is_due` 未定义。

- [ ] **Step 3: 实现 is_due 并重写主循环**

在 `get_backoff_interval` 之后加入：

```rust
/// 距上次探测的间隔达到当前退避档位（且不小于正常采样间隔）即视为到期
fn is_due(
    last_ping: DateTime<Utc>,
    consecutive_timeouts: u32,
    base_interval: u64,
    backoff_intervals: &[u64],
    now: DateTime<Utc>,
) -> bool {
    let interval =
        get_backoff_interval(consecutive_timeouts, backoff_intervals).max(base_interval);
    (now - last_ping).num_seconds() >= interval as i64
}
```

`start` 主循环从「读取配置 → 打开存储 → for 循环逐目标 await 探测」整体替换为三段式（保留运行门控、清理块与结尾 sleep 不动）：

```rust
            let base_interval = *state.interval_seconds.lock().await;
            let backoff_intervals = state.backoff_intervals.lock().await.clone();
            let timeout = *state.timeout_seconds.lock().await;
            let data_path = state.data_path.lock().await.clone();

            let storage = match Storage::open(data_path) {
                Ok(s) => s,
                Err(_) => continue,
            };

            let targets = storage
                .list_targets()
                .unwrap_or_default()
                .into_iter()
                .filter(|t| t.enabled)
                .collect::<Vec<_>>();

            let now = Utc::now();

            // 1. 锁内快照：筛出到期目标并即置 last_ping_time，锁不跨 await 持有
            struct DueProbe {
                target_id: Uuid,
                ipv4: String,
            }
            let due: Vec<DueProbe> = {
                let mut target_states = state.target_states.lock().await;
                targets
                    .iter()
                    .filter_map(|target| {
                        let ts = target_states.entry(target.id).or_default();
                        let expired = match ts.last_ping_time {
                            Some(last) => is_due(
                                last,
                                ts.consecutive_timeouts,
                                base_interval,
                                &backoff_intervals,
                                now,
                            ),
                            None => true,
                        };
                        if expired {
                            ts.last_ping_time = Some(now);
                            Some(DueProbe {
                                target_id: target.id,
                                ipv4: target.ipv4.clone(),
                            })
                        } else {
                            None
                        }
                    })
                    .collect()
            };

            // 2. 并发探测：一轮耗时取决于最慢一个目标，而非各目标之和
            let mut probe_set = tokio::task::JoinSet::new();
            for probe_job in due {
                probe_set.spawn(async move {
                    let result = ping::ping_target(&probe_job.ipv4, timeout).await;
                    (probe_job, result)
                });
            }

            // 3. 串行落库：样本写入与状态推进都在主任务里按完成顺序处理
            {
                let mut target_states = state.target_states.lock().await;
                while let Some(joined) = probe_set.join_next().await {
                    let (probe_job, result) = match joined {
                        Ok(pair) => pair,
                        Err(e) => {
                            eprintln!("探测任务异常: {e}");
                            continue;
                        }
                    };

                    let (status, latency_ms, error_kind) = match result {
                        Ok(ping::ParsedPing::Success { latency_ms }) => {
                            (PingStatus::Success, Some(latency_ms), None)
                        }
                        Ok(ping::ParsedPing::Timeout) => {
                            (PingStatus::Timeout, Some(timeout as f64), None)
                        }
                        Ok(ping::ParsedPing::Error { kind }) => (PingStatus::Error, None, Some(kind)),
                        Err(e) => (PingStatus::Error, None, Some(e.kind.clone())),
                    };

                    let sample = PingSample {
                        id: Uuid::new_v4(),
                        target_id: probe_job.target_id,
                        sent_at: now,
                        status,
                        latency_ms,
                        error_kind,
                    };

                    if let Err(e) = storage.insert_sample(&sample) {
                        eprintln!("写入采样失败: {e}");
                    }

                    let threshold = *state.alert_threshold.lock().await;
                    let ts = target_states.entry(probe_job.target_id).or_default();
                    let (alerting, notify, notify_alerting) = match sample.status {
                        PingStatus::Timeout | PingStatus::Error => {
                            ts.observe_failure(sample.status == PingStatus::Timeout, threshold)
                        }
                        PingStatus::Success => ts.observe_success(),
                    };

                    let _ = app_handle.emit(
                        "ping-sample",
                        PingSampleEvent {
                            sample,
                            alerting,
                            notify,
                            notify_alerting,
                        },
                    );
                }
            }
```

- [ ] **Step 4: 全量测试通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部 PASS（既有 backoff/告警/清理测试不受影响，新增 3 个 is_due 测试通过）。

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/scheduler.rs
git commit -m "perf: 采样改为并发执行，一轮耗时不再随目标数叠加"
```

---

### Task 3: 字段改名 ipv4 → address（含数据迁移）

**范围说明：** 本笔纯机械改名 + 迁移，不改任何行为语义；`is_valid_address` 本笔仍只认 IPv4（Task 5 才放开）。README/AGENTS/Cargo 描述中的"IPv4"措辞按 spec 随本笔更新。

**Files:**
- Modify: `src-tauri/src/models.rs`（`Target.address`/`NewTarget.address`/`is_valid_address`/测试）
- Modify: `src-tauri/src/error.rs`（`InvalidIpv4`→`InvalidAddress`，kind `"invalidIpv4"`→`"invalidAddress"`）
- Modify: `src-tauri/src/commands.rs`（`save_target`/`update_target`/`UpdateTargetPayload`）
- Modify: `src-tauri/src/storage.rs`（列迁移、设置键回退、SQL、测试）
- Modify: `src-tauri/src/scheduler.rs`（`ping_target(&target.ipv4)`→`(&target.address)`；`DueProbe.ipv4`→`.address`）
- Modify: `src-tauri/src/ping/command.rs`（参数名 `ipv4`→`address`）
- Modify: `src-tauri/Cargo.toml`（description → `IP latency monitor`）
- Modify: `README.md`、`AGENTS.md`（"IPv4 延迟监控"→"IP 延迟监控"等措辞）
- Modify: `src/types.ts`、`src/validation.ts`、`src/api/tauri.ts`、`src/state/usePingoStore.ts`
- Modify: `src/App.tsx`、`src/components/TargetCard.tsx`、`TargetGrid.tsx`、`DetailPanel.tsx`、`Toolbar.tsx`、`SettingsPanel.tsx`、`TargetEditor.tsx`
- Modify: `src/__tests__/store.test.ts`、`src/__tests__/charts.test.tsx`

**Interfaces:**
- Produces（Task 4/5 依赖）:
  - Rust: `Target.address: String`、`NewTarget.address: String`、`AppSettings.address_color: String`、`is_valid_address(&str) -> bool`
  - TS: `Target.address`、`NewTarget.address`、`TargetSaveData.address`、`AppSettings.addressColor`、`isValidAddress(value: string): boolean`、`api.updateTarget(id, address, alias)`

- [ ] **Step 1: Rust 端改名 + 列/设置键迁移（先写失败测试）**

在 `storage.rs` 测试模块加入迁移测试（沿用现有 TempDir 风格）：

```rust
    #[test]
    fn migrates_legacy_ipv4_column_and_settings_key() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("legacy.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(
                "CREATE TABLE targets (
                    id          TEXT PRIMARY KEY,
                    ipv4        TEXT NOT NULL,
                    alias       TEXT NOT NULL DEFAULT '',
                    enabled     INTEGER NOT NULL DEFAULT 1,
                    created_at  TEXT NOT NULL,
                    updated_at  TEXT NOT NULL
                );
                CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                INSERT INTO targets (id, ipv4, alias, enabled, created_at, updated_at)
                  VALUES ('11111111-1111-1111-1111-111111111111', '10.0.0.1', '', 1,
                          '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00+00:00');
                INSERT INTO settings (key, value) VALUES ('ipv4_color', '#123456');",
            )
            .unwrap();
        }
        let storage = Storage::open(&path).unwrap();
        let targets = storage.list_targets().unwrap();
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].address, "10.0.0.1");
        let settings = storage.get_settings().unwrap();
        assert_eq!(settings.address_color, "#123456");
        // 保存后落新键，旧键不再增长
        storage.save_settings(&settings).unwrap();
        let conn = Connection::open(&path).unwrap();
        let written: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'address_color'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(written, "#123456");
    }
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml migrates_legacy`
Expected: 编译失败（`address` 字段不存在）。

随后一次性完成 Rust 端改名：

1. `models.rs`：`Target.ipv4`→`address`、`NewTarget.ipv4`→`address`、`is_valid_ipv4`→`is_valid_address`（实现暂不变，仍 `parse::<Ipv4Addr>()`）、`AppSettings.ipv4_color`→`address_color`；测试里字段与断言同步更名（`target_requires_ipv4_shape` 改名 `target_requires_address_shape`，语义不变）。
2. `error.rs`：`InvalidIpv4`→`InvalidAddress`；kind 字符串 `"invalidIpv4"`→`"invalidAddress"`；报错文案改为 `"Invalid IP address."`。
3. `storage.rs`：
   - 建表语句 `ipv4 TEXT NOT NULL` → `address TEXT NOT NULL`；
   - `init_schema` 末尾追加迁移调用，并在 impl 中新增：

   ```rust
       /// 旧版数据文件的 targets.ipv4 列在打开时改名为 address（SQLite ≥ 3.25 支持原子改名）
       fn migrate_legacy_ipv4_column(&self) -> SqlResult<()> {
           let has_legacy: bool = self
               .conn
               .prepare("SELECT COUNT(*) FROM pragma_table_info('targets') WHERE name = 'ipv4'")?
               .query_row([], |row| row.get::<_, i64>(0))
               .map(|n| n > 0)?;
           if has_legacy {
               self.conn
                   .execute_batch("ALTER TABLE targets RENAME COLUMN ipv4 TO address;")?;
           }
           Ok(())
       }
   ```

   - `get_settings`：`ipv4_color` 字段来源改为新键优先、旧键回退：

   ```rust
           address_color: {
               let new_value = get_str(&self.conn, "address_color", "");
               if new_value.is_empty() {
                   get_str(&self.conn, "ipv4_color", "")
               } else {
                   new_value
               }
           },
   ```

   - `save_settings` 键名 `"ipv4_color"`→`"address_color"`；`list_targets`/`save_target` 的 SELECT/INSERT/UPDATE 列名 `ipv4`→`address`；既有测试字段名同步。
4. `commands.rs`：`new_target.ipv4`→`new_target.address`、`UpdateTargetPayload.ipv4`→`address`、`is_valid_ipv4`→`is_valid_address`、`AppError::InvalidIpv4`→`InvalidAddress`、局部变量 `ipv4`→`address`。
5. `scheduler.rs`：`ping::ping_target(&target.ipv4, ...)`→`&target.address`；`DueProbe.ipv4`→`address`（含构造处）。
6. `ping/command.rs`：参数名 `ipv4`→`address`（`build_ping_args(address, ...)`）。
7. `Cargo.toml`：`description = "IP latency monitor"`。

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部 PASS（含新迁移测试）。

- [ ] **Step 2: 前端改名（先写失败测试）**

在 `src/__tests__/store.test.ts` 加入外观旧键回退测试（与现有 import 风格一致，需引入 `loadAppearance`）：

```ts
it("loadAppearance 回退读取旧版 ipv4Color 字段", () => {
  localStorage.setItem(
    "pingo.appearance",
    JSON.stringify({ themeId: "grass-green", aliasColor: "", ipv4Color: "#123456" }),
  );
  const appearance = loadAppearance();
  expect(appearance.addressColor).toBe("#123456");
});
```

Run: `npm test`
Expected: 编译失败/断言失败（`addressColor` 不存在）。

随后一次性完成前端改名：

1. `src/types.ts`：`Target.ipv4`→`address`、`NewTarget.ipv4`→`address`、`TargetSaveData.ipv4`→`address`、`AppSettings.ipv4Color`→`addressColor`。
2. `src/validation.ts`：`isValidIpv4`→`isValidAddress`（实现暂不变）。
3. `src/api/tauri.ts`：`updateTarget(id: string, address: string, alias: string)`，payload `{ id, address, alias }`。
4. `src/state/usePingoStore.ts`：

   ```ts
   const LEGACY_ADDRESS_COLOR = "#6b7280";

   interface AppearanceSettings {
     themeId: string;
     aliasColor: string;
     addressColor: string;
   }

   /** 旧版外观对象里 IP 颜色字段名为 ipv4Color，读取时回退到新字段 */
   export function loadAppearance(): Partial<AppearanceSettings> {
     try {
       const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
       if (!raw) return {};
       const parsed = JSON.parse(raw) as Partial<AppearanceSettings> & { ipv4Color?: string };
       if (parsed.addressColor === undefined && parsed.ipv4Color !== undefined) {
         parsed.addressColor = parsed.ipv4Color;
       }
       delete parsed.ipv4Color;
       return parsed;
     } catch {
       return {};
     }
   }
   ```

   `saveAppearance` 写 `addressColor`；`normalizeSettings` 中 `ipv4Color` 相关判断改用 `LEGACY_ADDRESS_COLOR` 与 `addressColor`（含 appearance 覆盖分支）。
5. `src/App.tsx`：`target.ipv4`→`target.address`（排序/批量导入/日志/加载样本等全部点位）、`ImportedTarget.ipv4`→`address`、`effectiveIpv4Color`→`effectiveAddressColor`、`settings.ipv4Color`→`settings.addressColor`、`savedAppearance.ipv4Color`→`savedAppearance.addressColor`、`saveTarget({ address: ..., alias })`。
6. 组件：`TargetCard.tsx`（props `ipv4Color`→`addressColor`、`status.target.ipv4`→`address`）、`TargetGrid.tsx`（props 链）、`DetailPanel.tsx:23`、`SettingsPanel.tsx`（`draft.ipv4Color`→`draft.addressColor`）、`TargetEditor.tsx`（state 变量 `ipv4`→`address`，标签"IPv4 地址"→"IP 地址"，`onSave({ id, address, alias: alias || address })`，校验调用 `isValidAddress`）、`Toolbar.tsx:74`（"IPv4 延迟监控"→"IP 延迟监控"）。
7. `src/__tests__/store.test.ts`、`src/__tests__/charts.test.tsx`：fixture 字段名同步。

Run: `npm test && npm run build`
Expected: 测试全绿（uPlot 固有 unhandled error 除外）、类型检查通过。

- [ ] **Step 3: README/AGENTS 措辞同步**

- `README.md:3` "用于检测 IPv4 地址的可达性与延迟"→"用于检测 IP 地址的可达性与延迟"；`README.md:10` "IPv4 地址可达性检测"→"IP 地址可达性检测"；`README.md:31` "别名与 IPv4 文本颜色"→"别名与 IP 文本颜色"；`README.md:73` `validation.ts # IPv4 校验`→`# IP 地址校验`。
- `AGENTS.md` 项目概述 "轻量级桌面 IPv4 延迟监控工具"→"轻量级桌面 IP 延迟监控工具"；存储边界等段落如出现 `ipv4` 字段名一并改为 `address`。

- [ ] **Step 4: 两套测试最终确认并提交**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && npm test && npm run build`
Expected: 全绿。

```bash
git add -A
git commit -m "refactor: ipv4 字段统一更名为 address，兼容旧数据文件"
```

（提交正文分点列出：结构体/TS 类型改名、SQLite 列改名迁移、设置键 ipv4_color→address_color 读取回退、localStorage 外观键回退、README/AGENTS 措辞同步。）

---

### Task 4: Windows 改用 IcmpSendEcho 原生 ICMP

**Files:**
- Create: `src-tauri/src/ping/icmp.rs`（cfg(windows)，FFI 探测）
- Modify: `src-tauri/src/ping/mod.rs`（`ParsedPing` 枚举上移至此、cfg 分派 + 跨平台纯函数 `map_ip_status` + 其测试）
- Modify: `src-tauri/src/ping/command.rs`（删 Windows 分支，收缩为 Unix 专用）
- Modify: `src-tauri/src/ping/parser.rs`（删 `parse_ping_output_windows` 与 cfg 分派、删 Windows fixtures 测试）
- Delete: `src-tauri/src/fixtures/ping_windows_success.txt`、`src-tauri/src/fixtures/ping_windows_timeout.txt`
- Modify: `src-tauri/src/scheduler.rs`（`ping::ping_target`→`ping::probe`）
- Modify: `src-tauri/Cargo.toml`（移除 `encoding_rs`，新增 windows-sys）
- Modify: `AGENTS.md`（后端一节补 icmp.rs 说明）

**Interfaces:**
- Consumes: Task 3 的 `target.address`、`AppError::InvalidAddress`。
- Produces: `pub async fn probe(address: &str, timeout_secs: u64) -> CommandResult<ParsedPing>`（mod.rs 统一导出，Unix 下由 `ping_target` 承担）；`pub fn map_ip_status(status: u32, rtt_ms: u32) -> ParsedPing`（icmp.rs 消费、全平台可测）。

- [ ] **Step 1: 写 map_ip_status 失败测试（mod.rs）**

```rust
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
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml ip_status`
Expected: 编译失败，`map_ip_status` 未定义。

- [ ] **Step 2: 实现 mod.rs 分派与映射**

关键点：`ParsedPing` 从 `parser.rs` 上移到 `mod.rs`——parser 收缩为 Unix 专用后，Windows 目标编译仍需要这个类型（scheduler/icmp 都消费它）。`src-tauri/src/ping/mod.rs` 整体替换为：

```rust
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
        assert_eq!(map_ip_status(0, 0), ParsedPing::success(0.0));
        assert_eq!(map_ip_status(11010, 0), ParsedPing::timeout());
        assert_eq!(
            map_ip_status(11002, 0),
            ParsedPing::Error { kind: "ipStatus11002".to_string() }
        );
    }
}
```

`ParsedPing` 定义即在 `mod.rs`，`ping::ParsedPing` 路径对所有平台可用；`parse_ping_output` 仍由 parser.rs 提供、command.rs 直接 `super::parser::` 引用。执行顺序提示：Step 2 落盘后 parser.rs 内仍残留旧 `ParsedPing` 定义会编译冲突，先做 Step 4 的第 1、2 条（收缩 command/parser）再跑本步测试。

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全绿（含 `ip_status_maps_to_parsed_ping` 与既有 parser fixtures 测试）。

- [ ] **Step 3: 写 icmp.rs（cfg(windows)）**

新建 `src-tauri/src/ping/icmp.rs`：

```rust
//! Windows 原生 ICMP 探测：IcmpSendEcho（IPv4）/ Icmp6SendEcho2（IPv6）。
//! 免管理员权限，且摆脱对系统 ping 文本输出的 locale 依赖。

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

use windows_sys::Win32::Foundation::{GetLastError, HANDLE, INVALID_HANDLE_VALUE};
use windows_sys::Win32::NetworkManagement::IpHelper::{
    Icmp6CreateFile, Icmp6SendEcho2, IcmpCloseHandle, IcmpCreateFile, IcmpSendEcho,
    ICMP_ECHO_REPLY, ICMPV6_ECHO_REPLY,
};
use windows_sys::Win32::Networking::WinSock::{AF_INET6, IN6_ADDR, SOCKADDR_IN6};

use super::map_ip_status;
use super::ParsedPing;
use crate::error::{AppError, CommandResult};

/// 探测负载大小，对齐 Windows ping 默认的 32 字节
const REQUEST_SIZE: usize = 32;

pub async fn probe(address: &str, timeout_secs: u64) -> CommandResult<ParsedPing> {
    let addr: IpAddr = address.parse().map_err(|_| AppError::InvalidAddress)?;
    // 同步阻塞 API 放入阻塞线程池，避免占用异步 worker
    tokio::task::spawn_blocking(move || match addr {
        IpAddr::V4(v4) => probe_v4(v4, timeout_secs),
        IpAddr::V6(v6) => probe_v6(v6, timeout_secs),
    })
    .await
    .map_err(|e| AppError::PingCommand(e.to_string()))?
}

fn probe_v4(addr: Ipv4Addr, timeout_secs: u64) -> CommandResult<ParsedPing> {
    unsafe {
        let handle = IcmpCreateFile();
        if handle == INVALID_HANDLE_VALUE {
            return Err(AppError::PingCommand("IcmpCreateFile 失败".into()));
        }
        let result = send_echo_v4(handle, addr, timeout_secs);
        IcmpCloseHandle(handle);
        result
    }
}

fn probe_v6(addr: Ipv6Addr, timeout_secs: u64) -> CommandResult<ParsedPing> {
    unsafe {
        let handle = Icmp6CreateFile();
        if handle == INVALID_HANDLE_VALUE {
            return Err(AppError::PingCommand("Icmp6CreateFile 失败".into()));
        }
        let result = send_echo_v6(handle, addr, timeout_secs);
        IcmpCloseHandle(handle);
        result
    }
}

fn send_echo_v4(handle: HANDLE, addr: Ipv4Addr, timeout_secs: u64) -> CommandResult<ParsedPing> {
    let request = [0u8; REQUEST_SIZE];
    let reply_size = (std::mem::size_of::<ICMP_ECHO_REPLY>() + REQUEST_SIZE + 8) as u32;
    let mut reply_buf = vec![0u8; reply_size as usize];
    let timeout_ms = timeout_millis(timeout_secs);

    // DestinationAddress 是网络字节序的 u32
    let dest = u32::from_be_bytes(addr.octets());

    let replies = unsafe {
        IcmpSendEcho(
            handle,
            dest,
            request.as_ptr().cast(),
            REQUEST_SIZE as u16,
            std::ptr::null(),
            reply_buf.as_mut_ptr().cast(),
            reply_size,
            timeout_ms,
        )
    };

    if replies == 0 {
        // 无应答：按 GetLastError 的 IP_STATUS 区分超时与其他错误
        let status = unsafe { GetLastError() } as u32;
        return Ok(map_ip_status(status, 0));
    }

    let reply = unsafe { &*(reply_buf.as_ptr().cast::<ICMP_ECHO_REPLY>()) };
    Ok(map_ip_status(reply.Status, reply.RoundTripTime))
}

fn send_echo_v6(handle: HANDLE, addr: Ipv6Addr, timeout_secs: u64) -> CommandResult<ParsedPing> {
    let request = [0u8; REQUEST_SIZE];
    let reply_size = (std::mem::size_of::<ICMPV6_ECHO_REPLY>() + REQUEST_SIZE + 8) as u32;
    let mut reply_buf = vec![0u8; reply_size as usize];
    let timeout_ms = timeout_millis(timeout_secs);

    // source 传未指定地址（::），由系统选择出接口
    let mut source: SOCKADDR_IN6 = unsafe { std::mem::zeroed() };
    source.sin6_family = AF_INET6;
    let mut dest: SOCKADDR_IN6 = unsafe { std::mem::zeroed() };
    dest.sin6_family = AF_INET6;
    dest.sin6_addr = in6_addr(addr);

    let replies = unsafe {
        Icmp6SendEcho2(
            handle,
            std::ptr::null_mut(), // 同步调用，不使用事件
            None,                 // 不使用 APC 回调
            std::ptr::null_mut(),
            &source,
            &dest,
            request.as_ptr().cast(),
            REQUEST_SIZE as u16,
            std::ptr::null(),
            reply_buf.as_mut_ptr().cast(),
            reply_size,
            timeout_ms,
        )
    };

    if replies == 0 {
        let status = unsafe { GetLastError() } as u32;
        return Ok(map_ip_status(status, 0));
    }

    let reply = unsafe { &*(reply_buf.as_ptr().cast::<ICMPV6_ECHO_REPLY>()) };
    Ok(map_ip_status(reply.Status, reply.RoundTripTime))
}

fn in6_addr(addr: Ipv6Addr) -> IN6_ADDR {
    let mut raw: IN6_ADDR = unsafe { std::mem::zeroed() };
    raw.u.Byte = addr.octets();
    raw
}

fn timeout_millis(timeout_secs: u64) -> u32 {
    timeout_secs.saturating_mul(1000).min(u32::MAX as u64) as u32
}
```

注意：`reply.Status`/`reply.RoundTripTime`/`raw.u.Byte`/`HANDLE` 等类型与成员名以 windows-sys 实际定义为准（若 HANDLE 为 `isize` 型，null 处用 `0` 替代 `std::ptr::null_mut()`），编译报错时按错误信息就地修正，语义不得偏离本文件注释。

- [ ] **Step 4: 收缩 command.rs / parser.rs，删除 Windows 文本路径**

1. `command.rs`：删除 `CREATE_NO_WINDOW` 常量、GBK 解码、`cfg!(target_os = "windows")` 分支与 `build_ping_args` 的 windows 版本；`ping_target` 简化为：

```rust
use std::process::Stdio;
use tokio::process::Command;

use super::parser::parse_ping_output;
use super::ParsedPing;
use crate::error::{AppError, CommandResult};

pub async fn ping_target(address: &str, timeout_secs: u64) -> CommandResult<ParsedPing> {
    let mut cmd = Command::new("ping");
    cmd.args(build_ping_args(address, timeout_secs));

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| AppError::PingCommand(e.to_string()))?;

    Ok(parse_ping_output(&String::from_utf8_lossy(&output.stdout)))
}
```

`build_ping_args` 保留 macOS 与其余 Unix 两个 cfg 版本及其测试（Task 1 已有）。
2. `parser.rs`：删除文件内自带的 `ParsedPing` 定义（已上移 mod.rs，顶部改 `use super::ParsedPing;`）、删除 `parse_ping_output_windows` 整个函数与 `parse_ping_output` 的 cfg 分派（直接调 unix 版本）、删除 Windows fixtures 的两个测试。
3. 删除 `src-tauri/src/fixtures/ping_windows_success.txt`、`ping_windows_timeout.txt`。
4. `mod.rs` 的模块声明已在 Step 2 改为 `#[cfg(unix)] pub mod command; #[cfg(unix)] pub mod parser;`——Windows 目标不再编译系统 ping 路径，这是 Task 4 之后 `cargo check --target x86_64-pc-windows-msvc` 能通过的前提。
5. `scheduler.rs`：`ping::ping_target(&probe_job.address, timeout)` → `ping::probe(&probe_job.address, timeout)`。
6. `Cargo.toml`：删除 `encoding_rs = "0.8"`，末尾追加：

```toml
[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.59", features = [
    "Win32_Foundation",
    "Win32_NetworkManagement_IpHelper",
    "Win32_Networking_WinSock",
] }
```

- [ ] **Step 5: 双端验证**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全绿（Windows 相关代码不参与 macOS 编译路径，`map_ip_status` 测试全平台跑）。

Run: `rustup target add x86_64-pc-windows-msvc && cargo check --target x86_64-pc-windows-msvc --manifest-path src-tauri/Cargo.toml`
Expected: 编译通过（首次会全量编译依赖，耗时较长；FFI 签名/字段名错误在此暴露并就地修正）。

- [ ] **Step 6: AGENTS.md 同步与提交**

`AGENTS.md` 后端一节 `ping/` 行改为：`ping/ — command.rs 调系统 ping（Unix）、icmp.rs 走 Windows IcmpSendEcho/Icmp6SendEcho2 原生 ICMP，mod.rs 按平台分派`。

```bash
git add -A
git commit -m "feat: Windows 改用 IcmpSendEcho 原生 ICMP，摆脱 locale 文本解析"
```

（正文分点：新增 icmp.rs FFI 模块与统一入口 probe、删除 Windows 系统 ping 文本解析与 GBK/encoding_rs 依赖、IP_STATUS 映射纯函数、windows-sys 依赖。）

---

### Task 5: 支持 IPv6 目标

**Files:**
- Modify: `src-tauri/src/models.rs`（`is_valid_address` 放开 IPv6 + 测试重写）
- Create: `src-tauri/src/fixtures/ping_macos_ipv6_success.txt`（Step 1 现场捕获）
- Modify: `src-tauri/src/ping/parser.rs`（IPv6 fixture 测试）
- Modify: `src/validation.ts`（`isValidIpv6`/`isValidAddress`）
- Create: `src/__tests__/validation.test.ts`
- Create: `src/utils/address.ts`（`compareAddresses`）
- Modify: `src/App.tsx`（排序用 `compareAddresses`、批量导入用 `isValidAddress`）
- Modify: `src/components/TargetEditor.tsx`（标签/占位符/报错文案）
- Modify: `src/components/TargetCard.tsx`（title 提示）、`src/styles.css`（`.tcIp` 省略号）
- Modify: `README.md`、`AGENTS.md`（功能描述补 IPv6）

**Interfaces:**
- Consumes: Task 3 的 `address` 字段全链路；Task 4 的 `probe`（按 `IpAddr` 分派，IPv6 无需再改后端采集）。
- Produces: `isValidAddress(value: string): boolean`（IPv4+IPv6）、`isValidIpv6(value: string): boolean`、`compareAddresses(a: string, b: string): number`。

- [ ] **Step 1: 后端校验放开（先写失败测试）**

`models.rs` 测试 `target_requires_address_shape` 整体替换为：

```rust
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
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml target_accepts`
Expected: FAIL（`2001:db8::1` 被拒）。

实现（`models.rs`）：

```rust
/// 接受 IPv4/IPv6 字面量；zone index（如 fe80::1%eth0）显式拒绝
pub fn is_valid_address(value: &str) -> bool {
    if value.contains('%') {
        return false;
    }
    value.parse::<std::net::IpAddr>().is_ok()
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全绿。

- [ ] **Step 2: 捕获 macOS IPv6 fixture 并加解析测试**

```bash
ping -c 1 ::1 > src-tauri/src/fixtures/ping_macos_ipv6_success.txt 2>&1
```

`parser.rs` 测试模块加入（延迟数值随机，只断言成功不比对数值）：

```rust
    #[test]
    fn parses_macos_ipv6_success() {
        let text = include_str!("../fixtures/ping_macos_ipv6_success.txt");
        assert!(matches!(
            parse_ping_output(text),
            ParsedPing::Success { .. }
        ));
    }
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml parses_macos_ipv6`
Expected: PASS。

- [ ] **Step 3: 前端校验函数（先写失败测试）**

新建 `src/__tests__/validation.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { isValidAddress, isValidIpv6 } from "../validation";
import { compareAddresses } from "../utils/address";

describe("isValidIpv6", () => {
  it.each([
    ["2001:db8::1", true],
    ["::1", true],
    ["::", true],
    ["2001:db8:0:0:0:0:0:1", true],
    ["::ffff:192.168.1.1", true],
    ["fe80::1", true],
    ["1::2::3", false],
    ["2001:db8:::1", false],
    ["12345::", false],
    [":1:2", false],
    ["1:2:", false],
    ["fe80::1%eth0", false],
    ["example.com", false],
    ["192.168.1.1", false],
  ])("isValidIpv6(%s) = %s", (input, expected) => {
    expect(isValidIpv6(input)).toBe(expected);
  });
});

describe("isValidAddress", () => {
  it("同时接受 IPv4 与 IPv6 字面量，拒绝域名", () => {
    expect(isValidAddress("192.168.1.1")).toBe(true);
    expect(isValidAddress("2001:db8::1")).toBe(true);
    expect(isValidAddress("example.com")).toBe(false);
  });
});

describe("compareAddresses", () => {
  it("IPv4 按数值比较而非字典序", () => {
    expect(compareAddresses("10.0.0.10", "10.0.0.2")).toBeGreaterThan(0);
  });
  it("IPv4 恒排在 IPv6 之前，IPv6 间按字符串比较", () => {
    expect(compareAddresses("2001:db8::1", "192.168.1.1")).toBeGreaterThan(0);
    expect(compareAddresses("::1", "2001:db8::1")).toBeLessThan(0);
  });
});
```

Run: `npm test -- validation`
Expected: FAIL（函数不存在）。

实现 `src/validation.ts`（保留 `isValidIpv4` 作内部实现，新增导出）：

```ts
export function isValidIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

/** IPv6 字面量校验：组 0–ffff，"::" 至多一次，末组允许内嵌 IPv4，拒绝 zone index */
export function isValidIpv6(value: string): boolean {
  if (value.includes("%")) return false;
  const sections = value.split("::");
  if (sections.length > 2) return false;

  const parseGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const groups = part.split(":");
    const out: number[] = [];
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      // 末组允许内嵌 IPv4，折算为 2 个 16 位组
      if (i === groups.length - 1 && group.includes(".")) {
        if (!isValidIpv4(group)) return null;
        const octets = group.split(".").map(Number);
        out.push(((octets[0] << 8) | octets[1]) >>> 0, ((octets[2] << 8) | octets[3]) >>> 0);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };

  if (sections.length === 2) {
    const head = parseGroups(sections[0]);
    const tail = parseGroups(sections[1]);
    if (head === null || tail === null) return false;
    // "::" 至少替掉一组
    return head.length + tail.length <= 7;
  }
  const groups = parseGroups(sections[0]);
  return groups !== null && groups.length === 8;
}

/** 目标地址校验入口：IPv4 或 IPv6 字面量 */
export function isValidAddress(value: string): boolean {
  return isValidIpv4(value) || isValidIpv6(value);
}
```

新建 `src/utils/address.ts`：

```ts
function ipv4ToNum(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
}

/** IP 排序比较（a-b 语义）：IPv4 按数值，IPv6 间按字符串；IPv4 恒排在 IPv6 之前 */
export function compareAddresses(a: string, b: string): number {
  const aIsV6 = a.includes(":");
  const bIsV6 = b.includes(":");
  if (aIsV6 !== bIsV6) return aIsV6 ? 1 : -1;
  if (aIsV6) return a.localeCompare(b);
  return ipv4ToNum(a) - ipv4ToNum(b);
}
```

Run: `npm test -- validation`
Expected: PASS。

- [ ] **Step 4: 接入 UI**

1. `src/App.tsx`：排序分支替换为

   ```ts
   if (sortMode === "ip") {
     return direction * compareAddresses(a.target.address, b.target.address);
   }
   ```

   （删除内联 `ipToNum`，顶部 import `compareAddresses`。）批量导入 `isValidIpv4(ip)`→`isValidAddress(ip)`。
2. `src/components/TargetEditor.tsx`：占位符 `"192.168.1.1"`→`"192.168.1.1 或 2001:db8::1"`；报错文案 `"Only IPv4 addresses are supported in this version."`→`"请输入有效的 IPv4 或 IPv6 地址"`。
3. `src/components/TargetCard.tsx`：`<span className="tcIp" ...>` 加 `title={status.target.address}`。
4. `src/styles.css` `.tcIp`：`white-space: nowrap;` 后追加

   ```css
     max-width: 100%;
     overflow: hidden;
     text-overflow: ellipsis;
   ```

Run: `npm test && npm run build`
Expected: 全绿。

- [ ] **Step 5: Windows 编译级验证 + 文档同步 + 提交**

Run: `cargo check --target x86_64-pc-windows-msvc --manifest-path src-tauri/Cargo.toml`
Expected: 通过（Icmp6SendEcho2 路径随 IPv6 校验放开真正可达）。

`README.md` 功能列表加一条 `- IPv6 地址可达性检测`；`AGENTS.md` 项目概述改为"轻量级桌面 IP（IPv4/IPv6）延迟监控工具"。

```bash
git add -A
git commit -m "feat: 支持 IPv6 目标"
```

（正文分点：前后端 IPv6 校验、Windows Icmp6SendEcho2、Unix 依赖现代 ping 自动识别、排序/批量导入/编辑器适配、长地址省略显示。）

---

### Task 6: 收尾验证

- [ ] **Step 1: 全量验证**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && npm test && npm run build`
Expected: 全绿（uPlot 固有 unhandled error 除外）。

- [ ] **Step 2: 交付说明**

向用户交付时明确：Windows 实机验收（原生 ICMP v4/v6、40 目标并发采样性能）只能由用户执行；macOS 侧已由测试与实测覆盖。
