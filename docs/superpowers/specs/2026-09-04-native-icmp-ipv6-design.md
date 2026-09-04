# Windows 原生 ICMP + 并发采样 + IPv6 支持设计

日期：2026-09-04

## 背景与目标

Pingo 目前通过 spawn 系统 `ping` 命令采集延迟（`ping/command.rs` + 文本解析 `ping/parser.rs`），调度循环逐目标串行 await。本次变更解决四个问题：

1. Windows 侧文本解析依赖系统 locale（中英文关键字匹配 + GBK 解码），脆弱且已显化；
2. 40 目标规模下串行采样一轮耗时不可控（全部超时最坏 40 × 超时秒数）；
3. 仅支持 IPv4 目标；
4. macOS 上 `ping -W` 参数单位为毫秒而代码传入秒值，超时实际约 5ms，WAN 目标被误判超时（已实测确认）。

已确认的决策：

- Windows 改用 `IcmpSendEcho` 系原生 ICMP，Unix 侧保留系统 ping；
- 字段全量改名 `ipv4` → `address`（含 SQLite 列、设置键、localStorage 外观键），旧数据文件打开时自动迁移；
- 仅支持 IP 字面量，不做域名解析、不支持带 `%` zone index 的 IPv6。

## 方案选型

| 决策点 | 选择 | 否决的备选 |
|---|---|---|
| Windows FFI 绑定 | `windows-sys` crate（官方声明，按需 feature） | 手写 `extern` 块：结构体布局易错 |
| ICMP 调用模型 | 同步 `IcmpSendEcho`/`Icmp6SendEcho2` + 每目标 `spawn_blocking` | OVERLAPPED 异步：事件生命周期管理复杂，40 目标用不上 |
| 调度并发模型 | 整批 `JoinSet` 并发探测，结果回主循环串行落库 | 每目标独立循环任务：需重构存储句柄共享与状态机 |

## 1. Windows 原生 ICMP（新模块 `src-tauri/src/ping/icmp.rs`，cfg(windows)）

- 统一入口 `ping::probe(address: &str, timeout_secs: u64) -> CommandResult<ParsedPing>`：
  - `std::net::IpAddr::from_str` 解析地址，按地址族分发；
  - IPv4：`IcmpCreateFile` + `IcmpSendEcho`；
  - IPv6：`Icmp6CreateFile` + `Icmp6SendEcho2`（source 传 `in6addr_any`）；
  - 每次调用开/关句柄，不做跨任务句柄缓存；
  - 请求负载 32 字节（对齐 Windows ping 默认），应答缓冲区按结构体 + 负载分配；
  - `spawn_blocking` 包裹同步调用，超时参数换算为毫秒。
- 状态码映射为纯函数（便于 cfg(windows) 单测）：
  - `IP_SUCCESS` (0) → `ParsedPing::Success { latency_ms: RoundTripTime }`（RTT 为 0 视作 <1ms，保留 0.0）；
  - `IP_REQ_TIMED_OUT` (11010) → `ParsedPing::Timeout`；
  - 其余状态（`IP_DEST_HOST_UNREACHABLE` 等）→ `ParsedPing::Error { kind }`，kind 用 `ipStatus<N>` 形式的稳定标识。
- **Windows 不再调用系统 ping**，随之删除：
  - `parser.rs` 的 Windows 分支（`parse_ping_output_windows`）；
  - `command.rs` 的 GBK 解码与 `encoding_rs` 依赖（Cargo.toml 一并移除）；
  - Windows 输出 fixtures 及其测试。
- `parser.rs` 收缩为 Unix 专用；`command.rs` 保留系统 ping 路径并按 `cfg` 与 icmp 模块互斥。

## 2. 采样并发化（`scheduler.rs`）

把现有的顺序 for-await 循环拆为三段，状态机/退避/通知逻辑零改动：

1. **锁定快照**：持 `target_states` 锁筛出到期目标、即置 `last_ping_time`，随即释放锁（不持锁跨 await）；
2. **并发探测**：到期目标逐个 `tokio::spawn` 进 `JoinSet`，每个内部走 `ping::probe`（Windows 侧即 spawn_blocking）；
3. **串行落库**：按目标顺序收回结果，逐条写样本、推状态机、emit `ping-sample` 事件。

一轮耗时从各目标探测之和降为最慢单个探测的耗时。

## 3. 字段改名 `ipv4` → `address`（含数据迁移）

- Rust `Target.ipv4` → `address`、`NewTarget.ipv4` → `address`；TS `Target`/`NewTarget`/`TargetSaveData`/`AppSettings.ipv4Color` 同步改名（`addressColor`）。前后端约 19 个文件机械替换。
- SQLite 列迁移：`Storage::init_schema` 建表后检查 `PRAGMA table_info(targets)`，存在 `ipv4` 列则 `ALTER TABLE targets RENAME COLUMN ipv4 TO address`（rusqlite bundled SQLite ≥ 3.25 支持）；新建库直接建 `address` 列。此为应用自身升级逻辑，随打开数据文件自动执行。
- 设置键 `ipv4_color` → `address_color`：`get_settings` 先读新键、缺则回退旧键；`save_settings` 只写新键。
- localStorage 外观对象：字段 `ipv4Color` → `addressColor`；`loadAppearance` 对旧字段做回退读取，`normalizeSettings` 归一化后保存即落新字段。
- `models.rs` 校验函数、`error.rs` 中 InvalidIpv4 类错误变体、`validation.ts`、`commands.rs` 入口校验、组件 props、store、测试一并更名。
- README.md / AGENTS.md / Cargo.toml `description` 中"IPv4 延迟监控"等表述随本笔更新。

## 4. IPv6 支持

- 校验：
  - Rust：`is_valid_address(value) = IpAddr::from_str(value).is_ok() && !value.contains('%')`（拒绝 zone index）；
  - TS：`isValidAddress`，IPv4 沿用现逻辑，IPv6 手写校验（`::` 压缩至多一次、组 0–ffff、可内嵌 IPv4 尾段、拒绝 zone index 与非法冒号），边界用例配 Vitest 测试。
- 采集：
  - Windows 原生路径天然支持（Icmp6SendEcho2，见第 1 节）；
  - Unix 依赖现代系统 ping 对 IPv6 字面量的自动识别（iputils ≥ 2015、macOS Monterey+ 均已合并 ping6），不加 `-6` flag；
  - `ping::probe` 入口统一按 `IpAddr` 分派，Unix 分支不变即天然兼容。
- UI：
  - TargetEditor 标签改"IP 地址"，占位符含 IPv6 示例（如 `2001:db8::1`）；
  - TargetCard / DetailPanel 对长地址做 CSS 省略号 + `title` 提示，`addressColor` 令牌跟随现有外观机制；
- 明确不做：域名解析、zone index、旧版系统（CentOS 7 等 iputils < 2015 需 ping6 的环境）。

## 5. macOS/Windows 超时参数单位修复

`command.rs` Unix 分支按平台拆开（`cfg(target_os = "macos")` / 其余 Unix）：

- macOS：`-W` 传毫秒（`timeout_secs * 1000`）；
- Linux 及其他 Unix：`-W` 维持秒。

实测 Windows `-w` 亦为毫秒、现实现同样误传秒值，随本笔一并修复。

## 提交序列

五笔独立提交，每笔完成即跑对应测试（前端改动 `npm test` + `npm run build`，Rust 改动 `cargo test`，跨端命令改动两套都跑）：

1. `fix: 修正 macOS ping -W 超时单位为毫秒`
2. `perf: 采样改为并发执行`
3. `refactor: ipv4 字段统一更名为 address（含数据迁移）`
4. `feat: Windows 改用 IcmpSendEcho 原生 ICMP`
5. `feat: 支持 IPv6 目标`

## 验证策略与边界

- 全部五笔在 macOS 上跑 `cargo test` + `npm test` + `npm run build`；
- 第 4/5 笔涉及 Windows 专属代码，另跑 `cargo check --target x86_64-pc-windows-msvc` 做编译级验证（需先 `rustup target add x86_64-pc-windows-msvc`）；
- Windows 原生 ICMP 的真实调用无法在 macOS 上执行：状态码映射、地址分派等纯逻辑以 cfg(windows) 单测覆盖，端到端效果（原生探测、IPv6 探测、性能）需在 Windows 实机验收——该验收由用户执行；
- SQLite 列迁移用 tempfile 临时库测试：旧 schema（含 `ipv4` 列与旧设置键）打开后字段可读、写入落新键。
