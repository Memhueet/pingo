# 图表双模式与全历史统计设计（实时窗口 + 冻结全览 + 计数器化统计）

日期：2026-09-08

## 背景与目标

Pingo 定位是长时间观察站点延迟的生产级工具，当前图表链路存在四个随运行时间恶化的问题：

1. **图表无柱子上限**：`DetailPanel` 把 `status.samples` 原样传给 `LatencyChart`，全部样本一次性绘制，无时间窗口或条数截断；
2. **内存无上界**：`applyPingSample` 无限追加样本；打开/切换数据文件时为**所有目标**全量 `loadSamples`（不带时间范围，SQL 无 LIMIT）——按默认 5 秒间隔 × 7 天保留，单目标约 12 万条，10 目标即百万级 JS 对象常驻；
3. **每 tick 全量重算**：默认每 5 秒 `[...samples, sample]` 复制整个数组、`LatencyChart` 三次全量 `map` 后 `setData`；`Toolbar` 全局统计、延迟排序、`TargetCard`、`DetailPanel` 头部每次渲染全量扫描样本数组；
4. **保留清理只删 SQLite**：`cleanup_retention` 不裁剪内存中已加载的旧样本。

已确认的决策：

- 实时视图按时间窗口截断，默认 1 小时，设置可调（预设档位 + 自定义输入）；
- 提供"查看全部"入口：进入后呈现**冻结快照**（图表与头部统计都定格），对采样零影响，退出即弃；
- 统计数字（Average / Max / Timeouts / 丢包率等）始终为**全历史口径**：Rust 流式聚合出基线，前端 O(1) 运行计数器增量维护；
- 窗口裁剪带宽容度 H（内部常量 10 分钟）：跨度达到 W+H 时一次性裁回 W，消除逐条 shift；
- 图表数据数组复用 + 增量 push，避免每 tick 重建三个大数组。

## 方案选型

| 决策点 | 选择 | 否决的备选 |
|---|---|---|
| 实时窗口语义 | 按时间窗口 W + 宽容度 H | 按条数：含义随采样间隔漂移；纯滑动窗口：每 tick O(n) shift |
| 统计口径 | 始终全历史（聚合基线 + 运行计数器） | 跟随视图：同一数字随视图跳动、两套口径；仅本次运行：与"长时观察"定位不符 |
| 全量查看 | 冻结快照，一次加载退出即弃 | 常驻全量数组：内存无上界；边采样边画全量：每 tick O(全部历史) |
| 大数据量全览 | 本期全量点直接绘制 | 按像素分箱降采样：本期不做（YAGNI），取数逻辑隔离成单函数以便日后无感替换 |

## 1. 数据模型：全历史统计 FullStats

新增跨端结构（`models.rs` + `types.ts` 成对，serde camelCase）：

```rust
pub struct FullStats {
    pub total_count: u64,
    pub success_count: u64,
    pub latency_sum: f64,
    pub latency_max: f64,
    pub timeout_count: u64,        // raw：全部超时样本数
    pub filtered_timeout_count: u64, // "忽略单次超时"口径：连续 ≥2 的超时才计入
}
```

- 语义与现有 `calculateTargetStats` 完全对齐：`avgLatency = latency_sum / success_count`（无成功样本时 0），`maxLatency = latency_max`，`timeoutRate = timeout / total`。成功与错误样本在两种口径下都原样保留，**avg / max 不受"忽略单次超时"开关影响，仅 Timeouts 数字随开关在 raw / filtered 间取值**；
- **filtered 状态机**（前后端同一算法，实现为纯函数便于测试）：按 `sentAt` 顺序扫描，`timeout` 样本进入 pending run；run 长度 ≥ 2 时整段计入；**尾部未确认的 run 不计入**（与 `filterIsolatedTimeouts` "末尾待确认前同样隐藏"的既有语义一致）；`error` 样本视作非超时，中断 run；
- 增量更新（`applyPingSample` 内 O(1)）：需在 `TargetStatus` 上额外维护簿记字段 `pendingTimeoutRun: number`（不跨 IPC）。样本为 timeout → pending +1、raw timeout_count +1；样本为非 timeout → pending ≥ 2 则 filtered += pending，pending 清零；success 且 latencyMs 非 null → success_count +1、sum += latency、max 取大者；total_count 总是 +1；
- **计数器不受窗口裁剪影响**：裁剪只删图表窗口数组，统计口径是全历史；
- `TargetStatus` 增加 `stats: FullStats` 与 `pendingTimeoutRun` 两个字段；`createTargetStatus` 清零；`clear_history` 前端处理器一并清零；
- 统计消费点（`TargetCard`、`DetailPanel` 头部、`Toolbar` 全局统计、延迟排序）全部改读 `status.stats`，经小工具函数 `statsView(stats, ignoreSingleTimeout)` 派生现 `TargetStats` 形状（含 avg/max/timeoutCount/totalCount/timeoutRate/successCount）。`stats.ts` 保留 `filterIsolatedTimeouts`（图表窗口过滤仍用）与 `calculateTargetStats`（测试对照基准）。

## 2. Rust：聚合基线与载荷

- `Storage` 新增聚合查询：单条 `SELECT target_id, sent_at, status, latency_ms FROM ping_samples ORDER BY target_id, sent_at` 流式游标，按目标分组跑第 1 节状态机，输出 `Vec<TargetStatsEntry { target_id, stats }>`。不积累行、不跨 IPC 传样本对象；
- `BootstrapPayload` / `HistoryFilePayload` 增加 `target_stats: Vec<TargetStatsEntry>`，`bootstrap` / `switch_data_file` / `new_data_file` / `open_history_file` 四个命令全部携带；
- **无新增 Tauri 命令**：选中目标按窗口取数复用现有 `samples` 命令（SQL 已支持 `from`，前端补传即可），`invoke_handler` 与 `capabilities/` 不动；
- 保留清理、退避、调度逻辑零改动。

## 3. 前端状态与数据流（usePingoStore + App.tsx）

- **打开/切换数据文件不再全量加载样本**：删除 `switchDataFile` 后逐目标 `loadSamples` 的循环，改用 `payload.targetStats` 填充各目标 `stats`，`samples` 留空。打开大文件速度随之显著提升；
- **选中目标按窗口加载**：现有"选中时 `loadSamples` 并按 id 去重合并"的 effect 保留，补传 `from = now - (W + H)`，effect 依赖加入 `chartWindowSeconds`；合并结果同样套 `W + H` 裁剪。窗口设置变更时选中目标立即重取，其余目标在下次采样 tick 或重新选中时自然收敛；
- **`applyPingSample(status, sample, alerting, windowSeconds)`**：push 样本 → O(1) 更新计数器 → 宽容度裁剪（`last.sentAt - first.sentAt > W + H` 时头删至跨度 ≤ W）。事件订阅处传入当前设置值；
- 宽容度常量 `HYSTERESIS_MS = 10 * 60 * 1000`，不设为用户设置项。

## 4. 实时图表（LatencyChart）

- 组件用 `useRef` 持有 uPlot 三列数据数组（xs / success / timeout）及簿记（目标 id、长度、持有数组自身的首尾样本 id）；
- **增量判定规则**：新 `samples` 是持有数组的纯超集（长度 ≥ 持有长度，且持有数组的首、尾样本 id 在新数组同下标处逐一相等，即前缀关系成立）→ 纯追加，只 push 中间新增段后 `setData`（复用同一数组引用，uPlot 官方流式模式）；其余情形（批量裁剪 tick、目标切换、窗口变更、合并加载）→ 整体重建。裁剪几乎总与追加同 tick 发生，故重建频率 ≈ 每 10 分钟一次 O(W)，可忽略；
- 有窗口上限后，每次 `setData` 最多处理窗口内点数（默认 720，极端 24h × 1s ≈ 8.6 万），性能有界；`setData` 本身的 O(n) 是大窗口档位的固有权衡，宽容度优化不掉它，设置项描述中提示；
- 主题跟随机制不变（`key={theme.id}` 重挂载）。

## 5. 全览模式：冻结快照（DetailPanel）

- `DetailPanel` 增加本地视图状态 `viewMode: "live" | "frozen"`（切换选中目标时复位为 live）；
- 头部新增"查看全部"按钮——它是临时视图动作，与"忽略单次超时"那类持久偏好不同，故放面板头部而非设置页；
- **进入 frozen**：`loadAllSamples(id)`（全量 `loadSamples`，不带时间范围）取得样本，连同当前 `stats`、`takenAt` 组成快照；图表渲染快照样本，头部统计显示快照值并标注"快照于 HH:MM:SS"；
- **冻结期间**：ping 事件照常更新 store 计数器（TargetCard / 顶栏全局统计保持实时），但本面板图表与头部均不跟随；采样本身在 Rust 调度器，视图冻结对其零影响；
- **动作**：`刷新到最新`（重拍快照）、`返回实时`（丢弃快照切回 live；期间 store 一直在追加，live 数据无需重新查询）；
- 快照数据退出即弃，不常驻内存。取全量逻辑隔离在单一函数 `loadAllSamples`，日后如需"按像素分箱降采样"可无感替换；
- uPlot 既有框选缩放（`cursor.drag.x`）在全览模式下发挥价值；极端数据量（如 1s × 满 30 天 ≈ 260 万点）的跨 IPC 与首次渲染开销本期接受，为用户主动选择的低频动作。

## 6. 设置项 chartWindowSeconds

- 功能设置，随数据文件存 SQLite `settings` 表：新键 `chart_window_seconds`，`AppSettings` 增字段 `chart_window_seconds: u64`，Default 3600，serde `#[serde(default = ...)]` 兼容旧数据文件缺键；`get_settings` / `save_settings` 同步增删键；`types.ts` 成对增 `chartWindowSeconds: number`；
- SettingsPanel 功能页：下拉档位 **10 分钟 / 1 小时 / 6 小时 / 24 小时 / 自定义**；选"自定义"显示数字输入 + 单位下拉（分钟 / 小时 / 天），合法范围 **1 分钟 – 30 天**，保存时钳制并归一为秒；
- 描述文案提示：大窗口 × 高频采样组合的数据量与绘制开销；
- README.md 随对应提交更新使用说明。

## 7. 测试

前端 Vitest：

- 计数器增量结果与 `calculateTargetStats` 全量对照（含 success/timeout/error 混合的随机序列）；
- filtered 状态机：孤立超时隐藏、连续 ≥ 2 计入、尾部待确认不计入、error 中断 run；
- 宽容度裁剪：跨度 < W+H 不裁；达到 W+H 一次性裁回 ≤ W；裁剪不影响计数器；
- 图表增量判定：纯追加走 push 且数组引用不变；头删 / 目标切换 / 窗口变更走整体重建；
- DetailPanel 全览交互：进入拍快照并冻结头部、刷新到最新、返回实时（mock `api/tauri`）；
- 自定义窗口的单位换算与范围钳制。

Rust：

- 聚合基线：插入已知多目标序列 → 断言 `TargetStatsEntry`（Rust 版状态机与前端同语义）；
- `chart_window_seconds`：旧库缺键回退默认、保存读取回环。

按仓库约定：改前端跑 `npm test` + `npm run build`，改 Rust 跑 `cargo test`，跨端改动两套都跑。无新命令，`capabilities/` 与 `gen/schemas/` 不动。

## 提交序列（初步，写实现计划时细化）

1. `feat: 设置新增图表实时窗口（预设档位 + 自定义）`
2. `feat: 数据文件载荷附带各目标全历史统计基线`
3. `refactor: 统计消费点改读全历史计数器，采样增量更新`
4. `perf: 打开数据文件不再全量加载样本，选中目标按窗口加载`
5. `perf: 图表数据数组复用，窗口宽容度批量裁剪`
6. `feat: 详情面板新增查看全部（冻结快照）模式`

## 验证策略与边界

- 全部提交在 macOS 跑两套测试 + 构建；
- 端到端大数据量场景（十万点级全览首渲染、24 小时窗口实时、多目标长时间运行内存占用）无法在开发期完整模拟，需用户实测验收；
- 明确不做：按像素分箱降采样（接口预留）、`EventLog` 条目累积治理、窗口宽容度用户可配置。
