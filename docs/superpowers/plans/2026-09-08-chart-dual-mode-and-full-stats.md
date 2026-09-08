# 图表双模式与全历史统计 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实时图表按时间窗口截断（宽容度批量裁剪）+ "查看全部"冻结快照模式 + 全历史统计计数器化，消除长时间运行的内存无上界与每 tick 全量重算。

**Architecture:** 统计改为全历史口径：Rust 打开数据文件时流式聚合出 `FullStats` 基线随载荷下发，前端 `applyPingSample` O(1) 增量维护（含尾部待确认超时 run 的延续）；实时图表样本数组按 `窗口 W + 宽容度 H(600s)` 裁剪，`LatencyChart` 持有数据缓冲按"纯超集前缀"判定增量 push 或整体重建；全览模式在 `DetailPanel` 内取全量冻结快照，退出即弃。

**Tech Stack:** Tauri 2 + React 19 + TypeScript + rusqlite(bundled) + uPlot；测试 Vitest（jsdom）+ cargo test。

**Spec:** `docs/superpowers/specs/2026-09-08-chart-dual-mode-and-full-stats-design.md`（本计划从 spec 论证，两者一起阅读）

## Global Constraints

- 前后端方向严格单向：React 组件 → `src/api/tauri.ts` → Rust `commands.rs` → 各 Rust 模块；组件不得直接 `invoke`。
- `src/types.ts` 与 `src-tauri/src/models.rs` 成对修改，字段名 camelCase↔snake_case（Rust 侧 `#[serde(rename_all = "camelCase")]`）。
- 本计划**无新增 Tauri 命令**：`invoke_handler` 与 `capabilities/`、`gen/schemas/` 一律不动。
- 颜色/阴影一律用主题 CSS 变量（`--theme-*`），禁止组件内写死色值。
- 关键常量：`chartWindowSeconds` 默认 3600；宽容度 `CHART_WINDOW_HYSTERESIS_SECONDS = 600`；自定义窗口合法范围 60 – 2_592_000 秒（1 分钟 – 30 天）。
- 每个任务完成前必须跑：改前端 → `npm test` + `npm run build`；改 Rust → `cargo test --manifest-path src-tauri/Cargo.toml`；两端都改 → 两套都跑。
- `npm test` 中 uPlot 在 jsdom 下的 unhandled error 是已知误报，测试全部通过时不要当回归修。
- 提交信息中文，`<type>: <摘要>`；涉及 README.md / AGENTS.md 的改动随对应功能一起提交。
- 用户数据文件是仓库外的用户数据，调试时不得修改或删除。

---

### Task 1: 设置新增图表实时窗口 chartWindowSeconds（预设 + 自定义）

**Files:**
- Modify: `src-tauri/src/models.rs`（AppSettings 结构体约 4–18 行、`Default` 约 36–49 行）
- Modify: `src-tauri/src/storage.rs`（`get_settings` 约 89–117 行、`save_settings` 约 119–149 行、测试模块约 338 行起）
- Modify: `src/types.ts`（AppSettings，1–13 行）
- Create: `src/utils/duration.ts`
- Create: `src/__tests__/duration.test.ts`
- Modify: `src/components/SettingsPanel.tsx`（常规页 `settingsFieldGrid`，约 145–182 行）
- Modify: `src/__tests__/store.test.ts`（`makeSettings` 需补新必填字段）
- Modify: `AGENTS.md`（"设置存储边界"的功能设置枚举）
- Modify: `README.md`（"设置"小节）

**Interfaces:**
- Produces: `AppSettings.chartWindowSeconds: number`（TS 必填字段）；Rust `AppSettings.chart_window_seconds: u64`（serde default 3600）。
- Produces: `src/utils/duration.ts` 导出 `DurationUnit`（"minute" | "hour" | "day"）、`clampChartWindowSeconds(seconds: number): number`、`secondsToValueUnit(seconds: number): { value: number; unit: DurationUnit }`、`valueUnitToSeconds(input: { value: number; unit: DurationUnit }): number`、`CHART_WINDOW_MIN_SECONDS = 60`、`CHART_WINDOW_MAX_SECONDS = 2_592_000`。后续 Task 5/6 不依赖本任务 UI，仅依赖类型字段。

- [ ] **Step 1: 写失败的 Rust 测试（设置回环 + 缺键回退）**

在 `src-tauri/src/storage.rs` 测试模块（`mod tests`，已有 `TestHarness`）中追加：

```rust
#[test]
fn chart_window_seconds_roundtrip_and_default() {
    let harness = TestHarness::new();

    // 旧数据文件缺键时回退默认 3600
    let settings = harness.storage.get_settings().unwrap();
    assert_eq!(settings.chart_window_seconds, 3600);

    // 保存读取回环
    let mut settings = settings;
    settings.chart_window_seconds = 600;
    harness.storage.save_settings(&settings).unwrap();
    assert_eq!(harness.storage.get_settings().unwrap().chart_window_seconds, 600);
}
```

同时更新既有 `save_and_get_settings` 测试：其 `AppSettings { ... }` 字面量补 `chart_window_seconds: 3600` 字段（否则编译失败）。

- [ ] **Step 2: 运行确认编译失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml chart_window_seconds`
Expected: FAIL（`chart_window_seconds` 字段不存在，编译错误）

- [ ] **Step 3: Rust 侧最小实现**

`src-tauri/src/models.rs` — AppSettings 结构体加字段（`backoff_intervals` 之前）：

```rust
    /// 实时图表显示的时间窗口（秒）
    #[serde(default = "default_chart_window_seconds")]
    pub chart_window_seconds: u64,
```

`default_backoff_intervals` 函数旁加：

```rust
pub fn default_chart_window_seconds() -> u64 {
    3600
}
```

`Default for AppSettings` 实现加：

```rust
            chart_window_seconds: default_chart_window_seconds(),
```

`src-tauri/src/storage.rs` — `get_settings` 返回结构体字面量中加：

```rust
            chart_window_seconds: get_str(&self.conn, "chart_window_seconds", "3600")
                .parse()
                .unwrap_or(3600),
```

`save_settings` 的 `pairs` 数组加：

```rust
            (
                "chart_window_seconds",
                &settings.chart_window_seconds.to_string(),
            ),
```

- [ ] **Step 4: Rust 测试通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部 PASS

- [ ] **Step 5: 写失败的前端测试（duration 工具）**

创建 `src/__tests__/duration.test.ts`：

```typescript
import { describe, expect, it } from "vitest";
import {
  clampChartWindowSeconds,
  secondsToValueUnit,
  valueUnitToSeconds,
} from "../utils/duration";

describe("clampChartWindowSeconds", () => {
  it("钳制到 1 分钟 – 30 天", () => {
    expect(clampChartWindowSeconds(30)).toBe(60);
    expect(clampChartWindowSeconds(999_999_999)).toBe(2_592_000);
    expect(clampChartWindowSeconds(5400)).toBe(5400);
  });

  it("非法输入回落默认 3600", () => {
    expect(clampChartWindowSeconds(Number.NaN)).toBe(3600);
    expect(clampChartWindowSeconds(Number.POSITIVE_INFINITY)).toBe(3600);
  });
});

describe("secondsToValueUnit / valueUnitToSeconds", () => {
  it("整小时、整天优先大单位", () => {
    expect(secondsToValueUnit(3600)).toEqual({ value: 1, unit: "hour" });
    expect(secondsToValueUnit(172800)).toEqual({ value: 2, unit: "day" });
  });

  it("非整点值落到分钟", () => {
    expect(secondsToValueUnit(5400)).toEqual({ value: 90, unit: "minute" });
    expect(secondsToValueUnit(90000)).toEqual({ value: 25, unit: "hour" });
  });

  it("值×单位换回秒并钳制", () => {
    expect(valueUnitToSeconds({ value: 90, unit: "minute" })).toBe(5400);
    expect(valueUnitToSeconds({ value: 25, unit: "hour" })).toBe(90000);
    expect(valueUnitToSeconds({ value: 0, unit: "hour" })).toBe(60);
  });
});
```

- [ ] **Step 6: 运行确认失败**

Run: `npm test -- duration`
Expected: FAIL（模块不存在）

- [ ] **Step 7: 实现 duration 工具 + 类型字段**

创建 `src/utils/duration.ts`：

```typescript
export type DurationUnit = "minute" | "hour" | "day";

const UNIT_SECONDS: Record<DurationUnit, number> = {
  minute: 60,
  hour: 3600,
  day: 86400,
};

/** 图表实时窗口的合法范围（秒）：1 分钟 – 30 天 */
export const CHART_WINDOW_MIN_SECONDS = 60;
export const CHART_WINDOW_MAX_SECONDS = 2_592_000;

export function clampChartWindowSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 3600;
  return Math.min(
    CHART_WINDOW_MAX_SECONDS,
    Math.max(CHART_WINDOW_MIN_SECONDS, Math.round(seconds)),
  );
}

/** 展示拆值：整天/整小时优先取大单位，其余落分钟（值可为小数） */
export function secondsToValueUnit(seconds: number): {
  value: number;
  unit: DurationUnit;
} {
  if (seconds % 86400 === 0) return { value: seconds / 86400, unit: "day" };
  if (seconds % 3600 === 0) return { value: seconds / 3600, unit: "hour" };
  return { value: seconds / 60, unit: "minute" };
}

export function valueUnitToSeconds(input: {
  value: number;
  unit: DurationUnit;
}): number {
  return clampChartWindowSeconds(input.value * UNIT_SECONDS[input.unit]);
}
```

`src/types.ts` — AppSettings 增加必填字段（`backoffIntervals` 之前）：

```typescript
  /** 实时图表显示的时间窗口（秒），默认 1 小时 */
  chartWindowSeconds: number;
```

`src/__tests__/store.test.ts` — `makeSettings` 返回对象补 `chartWindowSeconds: 3600,`。

- [ ] **Step 8: duration 测试通过**

Run: `npm test -- duration`
Expected: PASS

- [ ] **Step 9: SettingsPanel 常规页加控件**

`src/components/SettingsPanel.tsx`：

顶部加 import 与预设常量（组件外）：

```typescript
import {
  clampChartWindowSeconds,
  secondsToValueUnit,
  valueUnitToSeconds,
  type DurationUnit,
} from "../utils/duration";

/** 图表实时窗口预设档位（秒） */
const CHART_WINDOW_PRESETS = [
  { value: 600, label: "10 分钟" },
  { value: 3600, label: "1 小时" },
  { value: 21600, label: "6 小时" },
  { value: 86400, label: "24 小时" },
];
```

组件内（`const [appVersion, setAppVersion] = useState("");` 之后）加自定义输入的本地状态：

```typescript
  const [customWindow, setCustomWindow] = useState(() =>
    secondsToValueUnit(settings.chartWindowSeconds),
  );
```

常规页 `settingsFieldGrid` 的"告警阈值" label 之后加：

```tsx
                <label>
                  图表实时窗口
                  <select
                    value={
                      CHART_WINDOW_PRESETS.some(
                        (p) => p.value === draft.chartWindowSeconds,
                      )
                        ? String(draft.chartWindowSeconds)
                        : "custom"
                    }
                    onChange={(event) => {
                      if (event.target.value === "custom") {
                        setCustomWindow(
                          secondsToValueUnit(draft.chartWindowSeconds),
                        );
                        setDraft({
                          ...draft,
                          chartWindowSeconds: clampChartWindowSeconds(
                            draft.chartWindowSeconds,
                          ),
                        });
                      } else {
                        setDraft({
                          ...draft,
                          chartWindowSeconds: Number(event.target.value),
                        });
                      }
                    }}
                    className="sortSelect"
                  >
                    {CHART_WINDOW_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                    <option value="custom">自定义</option>
                  </select>
                </label>
```

`settingsFieldGrid` 结束标签之后、"失败退避间隔" `settingsField` 之前加自定义输入块：

```tsx
              {CHART_WINDOW_PRESETS.some(
                (p) => p.value === draft.chartWindowSeconds,
              ) ? null : (
                <div className="settingsField">
                  <div className="backoffStepInput">
                    <input
                      type="number"
                      min={1}
                      value={customWindow.value}
                      aria-label="自定义图表窗口时长"
                      onChange={(event) => {
                        const next = {
                          ...customWindow,
                          value:
                            event.target.value === ""
                              ? 0
                              : Number(event.target.value),
                        };
                        setCustomWindow(next);
                        setDraft({
                          ...draft,
                          chartWindowSeconds: valueUnitToSeconds(next),
                        });
                      }}
                    />
                    <select
                      value={customWindow.unit}
                      aria-label="自定义图表窗口单位"
                      onChange={(event) => {
                        const next = {
                          ...customWindow,
                          unit: event.target.value as DurationUnit,
                        };
                        setCustomWindow(next);
                        setDraft({
                          ...draft,
                          chartWindowSeconds: valueUnitToSeconds(next),
                        });
                      }}
                    >
                      <option value="minute">分钟</option>
                      <option value="hour">小时</option>
                      <option value="day">天</option>
                    </select>
                  </div>
                  <p className="fieldHint">
                    范围 1 分钟 – 30 天。实时图表显示的时间范围；范围越大数据点越多，绘制开销越高
                  </p>
                </div>
              )}
```

- [ ] **Step 10: 更新 AGENTS.md 与 README.md**

AGENTS.md "设置存储边界（重要）"小节，功能设置括号枚举改为：

```
**功能设置**（间隔/超时/保留天数/告警阈值/退避阶梯/排序/图表实时窗口）随数据文件存 SQLite `settings` 表。
```

README.md "### 设置"小节的"常规"行改为：

```
- **常规**：排序方式、Ping 间隔/超时、历史保留天数、告警阈值、失败退避阶梯（逐档可视化编辑）、图表实时窗口（10 分钟/1/6/24 小时或自定义，1 分钟–30 天）
```

README.md "## 数据存储"的功能设置行同样补"图表实时窗口"：

```
- **功能设置**（Ping 间隔/超时、历史保留天数、告警阈值、失败退避、排序方式、图表实时窗口）随数据文件保存，每个监测档案可以有独立参数；
```

- [ ] **Step 11: 全量验证**

Run: `npm test && npm run build && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部 PASS（uPlot jsdom 已知误报除外）

- [ ] **Step 12: 提交**

```bash
git add -A
git commit -m "feat: 设置新增图表实时窗口（预设档位 + 自定义）

- AppSettings 新增 chartWindowSeconds，默认 3600 秒，旧库缺键回退默认
- 常规页下拉档位 10 分钟/1/6/24 小时，自定义支持数值+单位（分钟/小时/天）
- 范围钳制 1 分钟–30 天，新增 utils/duration 单元测试"
```

---

### Task 2: FullStats 模型与 Rust 聚合基线（载荷下发）

**Files:**
- Modify: `src-tauri/src/models.rs`（PingStatus 约 73–78 行、PingSample 约 82–89 行、BootstrapPayload 约 93–97 行、HistoryFilePayload 约 101–104 行；新增 FullStats / TargetStatsEntry / apply_sample_to_stats）
- Modify: `src-tauri/src/storage.rs`（新增 `target_stats` 方法，放在 `samples_for_target` 之后；测试模块加聚合测试）
- Modify: `src-tauri/src/commands.rs`（`bootstrap` 约 61–74 行、`open_history_file` 约 217–225 行、`switch_data_file` 约 266–313 行、`new_data_file` 约 331–357 行）
- Modify: `src/types.ts`（新增 FullStats / TargetStatsEntry，BootstrapPayload / HistoryFilePayload 补字段）

**Interfaces:**
- Consumes: Task 1 无依赖（本任务独立）。
- Produces: Rust `FullStats { total_count, success_count, latency_sum, latency_max, timeout_count, filtered_timeout_count, pending_timeout_run }`（camelCase 序列化）、`TargetStatsEntry { target_id: Uuid, stats: FullStats }`、纯函数 `models::apply_sample_to_stats(stats: &mut FullStats, status: &PingStatus, latency_ms: Option<f64>)`、`Storage::target_stats() -> SqlResult<Vec<TargetStatsEntry>>`。
- Produces: TS `FullStats` / `TargetStatsEntry`（`targetId` + `stats`）；`BootstrapPayload.targetStats: TargetStatsEntry[]`、`HistoryFilePayload.targetStats: TargetStatsEntry[]`。Task 3/4 依赖这些名字。

- [ ] **Step 1: 写失败的 Rust 测试（聚合基线）**

`src-tauri/src/storage.rs` 测试模块追加（`insert_sample` 为现有方法，签名 `(&self, sample: &PingSample)`）：

```rust
    #[test]
    fn target_stats_aggregates_full_history() {
        let harness = TestHarness::new();
        let target_a = uuid::Uuid::new_v4();
        let target_b = uuid::Uuid::new_v4();
        let base = chrono::Utc::now() - chrono::Duration::hours(1);

        let make = |offset_secs: i64, target: uuid::Uuid, status: crate::models::PingStatus, latency: Option<f64>| crate::models::PingSample {
            id: uuid::Uuid::new_v4(),
            target_id: target,
            sent_at: base + chrono::Duration::seconds(offset_secs),
            status,
            latency_ms: latency,
            error_kind: None,
        };
        use crate::models::PingStatus;

        // 目标 A：成功(10) 超时 成功(30) 错误 超时 超时 超时(尾部待确认)
        // 语义推演：位置2的超时被成功中断，run=1 不计入；
        // 末尾 run=3 未被非超时确认，不计入 filtered，以 pending=3 带出
        let samples_a = vec![
            make(0, target_a, PingStatus::Success, Some(10.0)),
            make(5, target_a, PingStatus::Timeout, None),
            make(10, target_a, PingStatus::Success, Some(30.0)),
            make(15, target_a, PingStatus::Error, None),
            make(20, target_a, PingStatus::Timeout, None),
            make(25, target_a, PingStatus::Timeout, None),
            make(30, target_a, PingStatus::Timeout, None),
        ];
        // 目标 B：成功(5)
        let samples_b = vec![make(0, target_b, PingStatus::Success, Some(5.0))];
        for sample in samples_a.iter().chain(samples_b.iter()) {
            harness.storage.insert_sample(sample).unwrap();
        }

        let mut entries = harness.storage.target_stats().unwrap();
        entries.sort_by_key(|e| e.target_id);
        assert_eq!(entries.len(), 2);

        let a = entries.iter().find(|e| e.target_id == target_a).unwrap().stats;
        assert_eq!(a.total_count, 7);
        assert_eq!(a.success_count, 2);
        assert_eq!(a.latency_sum, 40.0);
        assert_eq!(a.latency_max, 30.0);
        assert_eq!(a.timeout_count, 4);
        assert_eq!(a.filtered_timeout_count, 0);
        assert_eq!(a.pending_timeout_run, 3);

        let b = entries.iter().find(|e| e.target_id == target_b).unwrap().stats;
        assert_eq!(b.total_count, 1);
        assert_eq!(b.success_count, 1);
        assert_eq!(b.latency_sum, 5.0);
        assert_eq!(b.timeout_count, 0);
        assert_eq!(b.filtered_timeout_count, 0);
        assert_eq!(b.pending_timeout_run, 0);
    }
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml target_stats`
Expected: FAIL（`target_stats` 方法不存在，编译错误）

- [ ] **Step 3: 实现 FullStats、状态机与聚合查询**

`src-tauri/src/models.rs` — PingSample 结构体之后加：

```rust
/// 全历史统计计数器；前端按相同语义增量维护（stats.ts applySampleToStats）
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FullStats {
    pub total_count: u64,
    pub success_count: u64,
    pub latency_sum: f64,
    pub latency_max: f64,
    pub timeout_count: u64,
    /// "忽略单次超时"口径：被非超时样本确认的连续 ≥2 超时 run 之和
    pub filtered_timeout_count: u64,
    /// 尾部未确认的超时 run 长度；随基线下发以延续状态机
    pub pending_timeout_run: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TargetStatsEntry {
    pub target_id: Uuid,
    pub stats: FullStats,
}

/// 统计状态机推进一条样本：timeout 进入 pending run；
/// 非 timeout（成功或错误）时 run ≥2 整段计入 filtered；
/// 尾部未确认的 run 不计入，由 pending_timeout_run 带到下一次推进
pub fn apply_sample_to_stats(
    stats: &mut FullStats,
    status: &PingStatus,
    latency_ms: Option<f64>,
) {
    stats.total_count += 1;
    match status {
        PingStatus::Timeout => {
            stats.pending_timeout_run += 1;
            stats.timeout_count += 1;
        }
        other => {
            if stats.pending_timeout_run >= 2 {
                stats.filtered_timeout_count += stats.pending_timeout_run;
            }
            stats.pending_timeout_run = 0;
            if let (PingStatus::Success, Some(latency)) = (other, latency_ms) {
                stats.success_count += 1;
                stats.latency_sum += latency;
                stats.latency_max = stats.latency_max.max(latency);
            }
        }
    }
}
```

BootstrapPayload 与 HistoryFilePayload 都加字段：

```rust
    pub target_stats: Vec<TargetStatsEntry>,
```

`src-tauri/src/storage.rs` — `samples_for_target` 之后加：

```rust
    /// 全历史统计聚合：单条 SQL 按 target_id、sent_at 排序流式扫描，
    /// 逐行推进状态机，不积累样本行
    pub fn target_stats(&self) -> SqlResult<Vec<TargetStatsEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT target_id, status, latency_ms
             FROM ping_samples ORDER BY target_id ASC, sent_at ASC",
        )?;
        let mut rows = stmt.query([])?;
        let mut out: Vec<TargetStatsEntry> = Vec::new();
        let mut current: Option<(Uuid, FullStats)> = None;
        while let Some(row) = rows.next()? {
            let target_id_str: String = row.get(0)?;
            let target_id = Uuid::parse_str(&target_id_str).unwrap_or_default();
            match &mut current {
                Some((id, stats)) if *id == target_id => {
                    let status: PingStatus =
                        serde_json::from_str(&row.get::<_, String>(1)?)
                            .unwrap_or(PingStatus::Error);
                    let latency: Option<f64> = row.get(2)?;
                    crate::models::apply_sample_to_stats(stats, &status, latency);
                }
                _ => {
                    if let Some((id, stats)) = current.take() {
                        out.push(TargetStatsEntry { target_id: id, stats });
                    }
                    let mut stats = FullStats::default();
                    let status: PingStatus =
                        serde_json::from_str(&row.get::<_, String>(1)?)
                            .unwrap_or(PingStatus::Error);
                    let latency: Option<f64> = row.get(2)?;
                    crate::models::apply_sample_to_stats(&mut stats, &status, latency);
                    current = Some((target_id, stats));
                }
            }
        }
        if let Some((id, stats)) = current.take() {
            out.push(TargetStatsEntry { target_id: id, stats });
        }
        Ok(out)
    }
```

（若 `Uuid`/`PingStatus`/`FullStats` 未在 storage.rs 的 use 中引入，补 `use crate::models::{FullStats, PingStatus, TargetStatsEntry};` 等并去掉 `crate::models::` 前缀，与文件既有风格一致。）

- [ ] **Step 4: Rust 聚合测试通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml target_stats`
Expected: PASS（注意 Step 1 的最终断言值：`filtered == 0`、`pending == 3`）

- [ ] **Step 5: 四个命令携带 target_stats**

`src-tauri/src/commands.rs`：

`bootstrap` 在 `let targets = ...` 之后加：

```rust
    let target_stats = storage
        .target_stats()
        .map_err(|e| AppError::Storage(e.to_string()))?;
```

`Ok(BootstrapPayload { settings, targets, ping_running })` 改为 `Ok(BootstrapPayload { settings, targets, target_stats, ping_running })`。

`open_history_file` 同样加 `let target_stats = storage.target_stats().map_err(|e| AppError::Storage(e.to_string()))?;`，payload 改为 `Ok(HistoryFilePayload { path, targets, target_stats })`。

`switch_data_file`：在 `let targets = ...` 之后（换锁之前）对 `new_storage` 调用：

```rust
    let target_stats = new_storage
        .target_stats()
        .map_err(|e| AppError::Storage(e.to_string()))?;
```

payload 增加 `target_stats`。`new_data_file` 同 `switch_data_file`（同样对 `new_storage` 调用，payload 增加字段）。

- [ ] **Step 6: TS 类型成对新增**

`src/types.ts` — TargetStatus 之前加：

```typescript
/** 全历史统计计数器（Rust 聚合基线 + 前端增量维护） */
export interface FullStats {
  totalCount: number;
  successCount: number;
  latencySum: number;
  latencyMax: number;
  timeoutCount: number;
  /** "忽略单次超时"口径：被非超时样本确认的连续 ≥2 超时 run 之和 */
  filteredTimeoutCount: number;
  /** 尾部未确认的超时 run 长度，随基线传递以延续状态机 */
  pendingTimeoutRun: number;
}

export interface TargetStatsEntry {
  targetId: string;
  stats: FullStats;
}
```

`BootstrapPayload` 加 `targetStats: TargetStatsEntry[];`；`HistoryFilePayload`（若 types.ts 中有定义；无则仅 BootstrapPayload）加同名字段。用 `grep -n "HistoryFilePayload" src/types.ts` 确认。

- [ ] **Step 7: 全量验证**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && npm test && npm run build`
Expected: 全部 PASS（前端未消费新字段，编译不受影响）

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: 数据文件载荷附带各目标全历史统计基线

- FullStats/TargetStatsEntry 跨端模型，pending_timeout_run 随基线传递
- Storage::target_stats 单 SQL 流式聚合，逐行推进状态机不积累行
- bootstrap/switch/new/open 四命令载荷携带 targetStats"
```

---

### Task 3: 前端统计计数器化（stats 工具 + store 改造 + 消费点切换）

**Files:**
- Modify: `src/utils/stats.ts`（新增 emptyFullStats / applySampleToStats / statsView）
- Modify: `src/__tests__/stats.test.ts`
- Modify: `src/state/usePingoStore.ts`（createTargetStatus / applyPingSample / 新增 trimSamplesWindow 与宽容度常量）
- Modify: `src/__tests__/store.test.ts`
- Modify: `src/types.ts`（TargetStatus 加 `stats: FullStats`）
- Modify: `src/App.tsx`（bootstrap 填充基线、事件处理传窗口、globalStats/排序读计数器、TargetGrid 传 ignoreSingleTimeout）
- Modify: `src/components/TargetCard.tsx`、`src/components/TargetGrid.tsx`、`src/components/DetailPanel.tsx`（头部统计改 statsView）
- Modify: `src/__tests__/charts.test.tsx`（TargetStatus 字面量补 stats）

**Interfaces:**
- Consumes: Task 2 的 `FullStats` / `TargetStatsEntry` / `BootstrapPayload.targetStats`。
- Produces: `stats.ts` 导出 `emptyFullStats(): FullStats`、`applySampleToStats(stats: FullStats, sample: PingSample): FullStats`、`statsView(stats: FullStats, ignoreSingleTimeout: boolean): { avgLatency, maxLatency, timeoutCount, totalCount, successCount, timeoutRate }`。
- Produces: `usePingoStore.ts` 导出 `CHART_WINDOW_HYSTERESIS_SECONDS = 600`、`trimSamplesWindow(samples: PingSample[], windowSeconds: number): PingSample[]`；`createTargetStatus(target: Target, stats?: FullStats): TargetStatus`；`applyPingSample(status, sample, alerting, windowSeconds: number): TargetStatus`（第 4 参必填）。
- Produces: `TargetStatus.stats: FullStats`。Task 4/5/6 依赖以上全部签名。

- [ ] **Step 1: 写失败的 stats 测试**

`src/__tests__/stats.test.ts` 追加（复用文件内已有的样例构造方式；若无则按下述 makeSample 补一个）：

```typescript
import {
  applySampleToStats,
  calculateTargetStats,
  emptyFullStats,
  statsView,
} from "../utils/stats";
import type { PingSample } from "../types";

function makeSample(overrides: Partial<PingSample>): PingSample {
  return {
    id: "s",
    targetId: "t",
    sentAt: "2026-09-08T00:00:00Z",
    status: "success",
    latencyMs: 10,
    errorKind: null,
    ...overrides,
  };
}

describe("applySampleToStats", () => {
  it("增量计数与全量 calculateTargetStats 对照", () => {
    const statuses: PingSample["status"][] = [
      "success", "timeout", "error", "timeout", "timeout", "success", "timeout",
    ];
    const latencies = [10, null, null, null, null, 30, null];
    const samples = statuses.map((status, i) =>
      makeSample({
        id: `s${i}`,
        sentAt: new Date(Date.parse("2026-09-08T00:00:00Z") + i * 5000).toISOString(),
        status,
        latencyMs: latencies[i],
      }),
    );
    let stats = emptyFullStats();
    for (const sample of samples) stats = applySampleToStats(stats, sample);

    const full = calculateTargetStats(samples);
    expect(stats.totalCount).toBe(full.totalCount);
    expect(stats.timeoutCount).toBe(full.timeoutCount);
    expect(stats.successCount).toBe(full.successes.length);
    expect(stats.avgLatency).toBeCloseTo(full.avgLatency);
    expect(stats.latencyMax).toBe(full.maxLatency);
    // 中间连续 2 次超时被后续成功确认计入；尾部单次待确认不计
    expect(stats.filteredTimeoutCount).toBe(2);
    expect(stats.pendingTimeoutRun).toBe(1);
  });

  it("基线延续：尾部 pending=1 时再来一次超时，filtered 计入 2", () => {
    let stats = { ...emptyFullStats(), pendingTimeoutRun: 1 };
    stats = applySampleToStats(stats, makeSample({ status: "timeout", latencyMs: null }));
    expect(stats.filteredTimeoutCount).toBe(2);
    expect(stats.pendingTimeoutRun).toBe(2);
  });
});

describe("statsView", () => {
  it("avg/max 不受开关影响，Timeouts 随口径切换", () => {
    const stats = {
      ...emptyFullStats(),
      totalCount: 4,
      successCount: 2,
      latencySum: 50,
      latencyMax: 30,
      timeoutCount: 2,
      filteredTimeoutCount: 1,
    };
    const raw = statsView(stats, false);
    const filtered = statsView(stats, true);
    expect(raw.avgLatency).toBe(25);
    expect(filtered.avgLatency).toBe(25);
    expect(raw.maxLatency).toBe(30);
    expect(raw.timeoutCount).toBe(2);
    expect(filtered.timeoutCount).toBe(1);
    expect(raw.timeoutRate).toBe("50.0");
    expect(filtered.timeoutRate).toBe("25.0");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- stats`
Expected: FAIL（`applySampleToStats` 等未导出）

- [ ] **Step 3: 实现 stats 工具**

`src/utils/stats.ts` 顶部 import 改为 `import type { FullStats, PingSample } from "../types";`，文件末尾追加：

```typescript
export function emptyFullStats(): FullStats {
  return {
    totalCount: 0,
    successCount: 0,
    latencySum: 0,
    latencyMax: 0,
    timeoutCount: 0,
    filteredTimeoutCount: 0,
    pendingTimeoutRun: 0,
  };
}

/** 统计状态机推进一条样本（与 Rust models::apply_sample_to_stats 同语义） */
export function applySampleToStats(stats: FullStats, sample: PingSample): FullStats {
  const next = { ...stats };
  next.totalCount += 1;
  if (sample.status === "timeout") {
    next.pendingTimeoutRun += 1;
    next.timeoutCount += 1;
  } else {
    if (next.pendingTimeoutRun >= 2) {
      next.filteredTimeoutCount += next.pendingTimeoutRun;
    }
    next.pendingTimeoutRun = 0;
    if (sample.status === "success" && sample.latencyMs != null) {
      next.successCount += 1;
      next.latencySum += sample.latencyMs;
      next.latencyMax = Math.max(next.latencyMax, sample.latencyMs);
    }
  }
  return next;
}

/** 按显示口径派生视图统计；avg/max 与开关无关（超时样本本就不参与） */
export function statsView(stats: FullStats, ignoreSingleTimeout: boolean) {
  const timeoutCount = ignoreSingleTimeout
    ? stats.filteredTimeoutCount
    : stats.timeoutCount;
  return {
    avgLatency: stats.successCount > 0 ? stats.latencySum / stats.successCount : 0,
    maxLatency: stats.successCount > 0 ? stats.latencyMax : 0,
    timeoutCount,
    totalCount: stats.totalCount,
    successCount: stats.successCount,
    timeoutRate:
      stats.totalCount > 0
        ? ((timeoutCount / stats.totalCount) * 100).toFixed(1)
        : "0.0",
  };
}
```

- [ ] **Step 4: stats 测试通过**

Run: `npm test -- stats`
Expected: PASS

- [ ] **Step 5: 写失败的 store 测试（窗口参数、裁剪、计数器）**

`src/__tests__/store.test.ts`：

`makeSample` 的 sentAt 固定值保持不变，另加一个按序号偏移的构造辅助（describe 外）：

```typescript
function sampleAt(index: number, overrides?: Partial<PingSample>): PingSample {
  return makeSample({
    id: `sample-${index}`,
    sentAt: new Date(Date.parse("2026-06-18T00:00:00Z") + index * 5000).toISOString(),
    ...overrides,
  });
}
```

`describe("applyPingSample")` 内两个用例的第 3 参之后补第 4 参 `3600`；追加：

```typescript
describe("applyPingSample 统计计数器", () => {
  it("成功样本推进延迟合计与最大值", () => {
    let status = createTargetStatus(makeTarget());
    status = applyPingSample(status, sampleAt(0, { latencyMs: 10 }), false, 3600);
    status = applyPingSample(status, sampleAt(1, { latencyMs: 30 }), false, 3600);
    expect(status.stats.totalCount).toBe(2);
    expect(status.stats.successCount).toBe(2);
    expect(status.stats.latencySum).toBe(40);
    expect(status.stats.latencyMax).toBe(30);
  });

  it("超时样本推进 raw 计数，连续 ≥2 时计入 filtered", () => {
    let status = createTargetStatus(makeTarget());
    status = applyPingSample(status, sampleAt(0, { status: "timeout", latencyMs: null }), true, 3600);
    expect(status.stats.timeoutCount).toBe(1);
    expect(status.stats.filteredTimeoutCount).toBe(0);
    status = applyPingSample(status, sampleAt(1, { status: "timeout", latencyMs: null }), true, 3600);
    status = applyPingSample(status, sampleAt(2, { status: "success", latencyMs: 10 }), false, 3600);
    expect(status.stats.timeoutCount).toBe(2);
    expect(status.stats.filteredTimeoutCount).toBe(2);
    expect(status.stats.pendingTimeoutRun).toBe(0);
  });
});

describe("trimSamplesWindow", () => {
  const W = 60; // 秒

  it("跨度未超 W+宽容度 不裁剪", () => {
    const samples = Array.from({ length: 12 }, (_, i) => sampleAt(i));
    const trimmed = trimSamplesWindow(samples, W);
    expect(trimmed).toBe(samples);
  });

  it("跨度达到 W+宽容度 一次性裁回 W 以内", () => {
    // 间隔 5s × 40 条 = 跨度 195s > 60+120=180s
    const samples = Array.from({ length: 40 }, (_, i) => sampleAt(i));
    const trimmed = trimSamplesWindow(samples, W);
    const span =
      (Date.parse(trimmed[trimmed.length - 1].sentAt) - Date.parse(trimmed[0].sentAt)) / 1000;
    expect(span).toBeLessThanOrEqual(W);
    expect(trimmed.length).toBeLessThan(samples.length);
  });

  it("裁剪不影响计数器（全历史口径）", () => {
    let status = createTargetStatus(makeTarget());
    let samples: PingSample[] = [];
    for (let i = 0; i < 40; i++) {
      const sample = sampleAt(i, i % 10 === 0 ? { status: "timeout" as const, latencyMs: null } : {});
      samples = [...samples, sample];
      status = applyPingSample(status, sample, false, W);
    }
    expect(status.samples.length).toBeLessThan(40);
    expect(status.stats.totalCount).toBe(40);
    expect(status.stats.timeoutCount).toBe(4);
  });
});
```

import 行补 `trimSamplesWindow` 与 `PingSample` 类型。

- [ ] **Step 6: 运行确认失败**

Run: `npm test -- store`
Expected: FAIL（trimSamplesWindow 未导出 / applyPingSample 第 4 参缺失）

- [ ] **Step 7: 实现 store 改造**

`src/state/usePingoStore.ts`：

import 区改为：

```typescript
import type { AppSettings, FullStats, PingSample, Target, TargetStatus } from "../types";
import { applySampleToStats, emptyFullStats } from "../utils/stats";
```

`createTargetStatus` 之前加常量、之后改造签名：

```typescript
/** 实时窗口宽容度（秒）：跨度达到 W+H 才一次性裁回 W，避免逐条 shift */
export const CHART_WINDOW_HYSTERESIS_SECONDS = 600;

/** 跨度超过 W+H 时头删至跨度 ≤ W；其余情况原数组原样返回（零拷贝） */
export function trimSamplesWindow(
  samples: PingSample[],
  windowSeconds: number,
): PingSample[] {
  if (samples.length === 0) return samples;
  const windowMs = windowSeconds * 1000;
  const hysteresisMs = CHART_WINDOW_HYSTERESIS_SECONDS * 1000;
  const lastMs = Date.parse(samples[samples.length - 1].sentAt);
  const firstMs = Date.parse(samples[0].sentAt);
  if (lastMs - firstMs <= windowMs + hysteresisMs) return samples;
  const trimmed = [...samples];
  while (
    trimmed.length > 1 &&
    Date.parse(trimmed[trimmed.length - 1].sentAt) -
      Date.parse(trimmed[0].sentAt) >
      windowMs
  ) {
    trimmed.shift();
  }
  return trimmed;
}

export function createTargetStatus(target: Target, stats?: FullStats): TargetStatus {
  return {
    target,
    latestSample: null,
    consecutiveTimeouts: 0,
    alerting: false,
    samples: [],
    stats: stats ?? emptyFullStats(),
  };
}

export function applyPingSample(
  status: TargetStatus,
  sample: PingSample,
  alerting: boolean,
  windowSeconds: number,
): TargetStatus {
  const consecutiveTimeouts =
    sample.status === "timeout" || sample.status === "error"
      ? status.consecutiveTimeouts + 1
      : 0;

  return {
    ...status,
    latestSample: sample,
    samples: trimSamplesWindow([...status.samples, sample], windowSeconds),
    consecutiveTimeouts,
    alerting,
    stats: applySampleToStats(status.stats, sample),
  };
}
```

`src/types.ts` — TargetStatus 加字段 `stats: FullStats;`。

- [ ] **Step 8: store 测试通过**

Run: `npm test -- store`
Expected: PASS

- [ ] **Step 9: 切换消费点（TargetCard / TargetGrid / DetailPanel / App）**

`src/components/TargetCard.tsx`：

props 增加 `ignoreSingleTimeout: boolean;`（`addressColor` 之后），解构改为：

```typescript
import { statsView } from "../utils/stats";
// ...
  const { avgLatency, totalCount, timeoutCount, timeoutRate, successCount } =
    statsView(status.stats, ignoreSingleTimeout);
```

`calculateTargetStats` import 删除；JSX 中 `successes.length === 0` 改为 `successCount === 0`。

`src/components/TargetGrid.tsx`：props 接口与解构增加 `ignoreSingleTimeout: boolean;`，`<TargetCard` 增加 `ignoreSingleTimeout={ignoreSingleTimeout}`。

`src/components/DetailPanel.tsx`：头部统计改读计数器（filterIsolatedTimeouts 图表过滤保留）：

```typescript
import { calculateTargetStats, filterIsolatedTimeouts, statsView } from "../utils/stats";
// ...
  const visibleSamples = ignoreSingleTimeout
    ? filterIsolatedTimeouts(status.samples)
    : status.samples;
  const { avgLatency, maxLatency, timeoutCount } = statsView(
    status.stats,
    ignoreSingleTimeout,
  );
```

（`calculateTargetStats` 若本文件不再使用则从 import 移除。）

`src/App.tsx`：

1. import 补 `statsView`、`emptyFullStats`（来自 `./utils/stats`）；
2. bootstrap `.then` 中 `setTargets` 改为：

```typescript
        setTargets(
          payload.targets.map((t) =>
            createTargetStatus(
              t,
              payload.targetStats.find((e) => e.targetId === t.target.id)?.stats,
            ),
          ),
        );
```

3. ping-sample 事件处理：`setTargets` 回调里改 `applyPingSample(status, event.sample, event.alerting, chartWindowSecondsRef.current)`；并在 `targetsRef` 定义旁新增同步 ref（放在 `onPingSample` 订阅 effect 之前）：

```typescript
  const chartWindowSecondsRef = useRef(settings.chartWindowSeconds);
  useEffect(() => {
    chartWindowSecondsRef.current = settings.chartWindowSeconds;
  }, [settings.chartWindowSeconds]);
```

4. `globalStats` useMemo 改用计数器（依赖加 `ignoreSingleTimeout`）：

```typescript
  const globalStats = useMemo(() => {
    let enabled = 0;
    let alerting = 0;
    let latencySum = 0;
    let latencyTargetCount = 0;
    for (const status of targets) {
      if (status.target.enabled) enabled++;
      if (status.alerting) alerting++;
      if (status.target.enabled) {
        const view = statsView(status.stats, ignoreSingleTimeout);
        if (view.successCount > 0) {
          latencySum += view.avgLatency;
          latencyTargetCount++;
        }
      }
    }
    return {
      total: targets.length,
      enabled,
      alerting,
      avgLatency: latencyTargetCount > 0 ? latencySum / latencyTargetCount : 0,
    };
  }, [targets, ignoreSingleTimeout]);
```

5. `sortedTargets` 的 `sortMode === "latency"` 分支改为：

```typescript
      if (sortMode === "latency") {
        const avgLatency = (s: TargetStatus) =>
          s.stats.successCount > 0
            ? s.stats.latencySum / s.stats.successCount
            : Infinity;
        return direction * (avgLatency(a) - avgLatency(b));
      }
```

6. `<TargetGrid` 调用处增加 `ignoreSingleTimeout={settings.ignoreSingleTimeout}`（用 `grep -n "<TargetGrid" src/App.tsx` 定位）。

- [ ] **Step 10: 修复 charts.test.tsx 的 TargetStatus 字面量**

`src/__tests__/charts.test.tsx`：import 补 `applySampleToStats, emptyFullStats`（来自 `../utils/stats`）；文件内加辅助：

```typescript
function statusWithSamples(base: Omit<TargetStatus, "stats" | "samples">, samples: PingSample[]): TargetStatus {
  return {
    ...base,
    samples,
    stats: samples.reduce((acc, s) => applySampleToStats(acc, s), emptyFullStats()),
  };
}
```

两个用例的 TargetStatus 字面量改为经 `statusWithSamples` 构造（字面量去掉 `samples:` 字段传入第二参），断言不变（`Average 10.0 ms`、`Timeouts 1`；ignore 开启用例 `Timeouts 0`）。

- [ ] **Step 11: 全量验证**

Run: `npm test && npm run build`
Expected: 全部 PASS

- [ ] **Step 12: 提交**

```bash
git add -A
git commit -m "refactor: 统计消费点改读全历史计数器，采样增量更新并按宽容度裁剪窗口

- stats.ts 新增 emptyFullStats/applySampleToStats/statsView
- applyPingSample 增加窗口参数：O(1) 计数 + 跨度 W+600s 触发裁回 W
- TargetCard/DetailPanel/顶栏全局统计/延迟排序全部改读计数器
- bootstrap 载荷的 targetStats 填充各目标基线"
```

---

### Task 4: 打开数据文件不再全量加载，选中目标按窗口加载

**Files:**
- Modify: `src/App.tsx`（选中目标 effect 约 192–215 行、`handleSwitchDataFile` 约 460–505 行、`handleClearHistory` 约 534–543 行）

**Interfaces:**
- Consumes: Task 3 的 `trimSamplesWindow` / `CHART_WINDOW_HYSTERESIS_SECONDS` / `createTargetStatus(target, stats?)` / `chartWindowSecondsRef`。
- Produces: 无新接口；`App.tsx` 数据流变更（Task 5/6 只消费 props，不依赖本任务内部实现）。

- [ ] **Step 1: 选中目标 effect 改为按窗口加载**

现有 effect（`loadSamples(selectedTargetId)`）整体替换为：

```typescript
  useEffect(() => {
    if (!selectedTargetId) return;
    let cancelled = false;
    const windowSeconds = chartWindowSecondsRef.current;
    const from = new Date(
      Date.now() - (windowSeconds + CHART_WINDOW_HYSTERESIS_SECONDS) * 1000,
    ).toISOString();
    loadSamples(selectedTargetId, from)
      .then((loaded) => {
        if (cancelled) return;
        setTargets((current) =>
          current.map((status) => {
            if (status.target.id !== selectedTargetId) return status;
            const loadedIds = new Set(loaded.map((s) => s.id));
            const localOnly = status.samples.filter((s) => !loadedIds.has(s.id));
            const merged = trimSamplesWindow(
              [...loaded, ...localOnly],
              windowSeconds,
            );
            return {
              ...status,
              samples: merged,
              latestSample: merged[merged.length - 1] ?? status.latestSample,
            };
          }),
        );
      })
      .catch((e) => {
        if (cancelled) return;
        setAppError((e as any)?.message ?? String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTargetId, dataFilePath, settings.chartWindowSeconds]);
```

注意：`loadSamples` 现有签名已支持 `from`（`src/api/tauri.ts:45`），无需改 api 层。

- [ ] **Step 2: 删除打开数据文件的全量加载循环**

`handleSwitchDataFile` 中：

1. `const initialTargets = payload.targets.map(createTargetStatus);` 改为：

```typescript
      const initialTargets = payload.targets.map((t) =>
        createTargetStatus(
          t,
          payload.targetStats.find((e) => e.targetId === t.target.id)?.stats,
        ),
      );
```

2. 整段删除（`for (const target of payload.targets) { ... loadSamples ... }` 的 try/catch 循环）。

3. 检查 `grep -n "createTargetStatus" src/App.tsx` 是否还有其他 `payload.targets.map(createTargetStatus)` 调用点（如新建数据文件处理器），存在则同样改为带基线查找的形式。

- [ ] **Step 3: 清空历史时重置计数器**

`handleClearHistory` 的 `setTargets` 回调改为：

```typescript
      setTargets((current) =>
        current.map((s) => ({
          ...s,
          samples: [],
          latestSample: null,
          stats: emptyFullStats(),
        })),
      );
```

（`emptyFullStats` 已在 Task 3 引入 App.tsx import。）

- [ ] **Step 4: 全量验证**

Run: `npm test && npm run build && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "perf: 打开数据文件不再全量加载样本，选中目标按窗口加载

- 切换/新建数据文件只填充聚合统计基线，samples 留空
- 选中目标按 窗口+宽容度 的 from 增量加载，合并后套用宽容度裁剪
- 清空历史同时重置统计计数器"
```

---

### Task 5: LatencyChart 数据缓冲复用（增量追加 / 前缀判定重建）

**Files:**
- Modify: `src/components/LatencyChart.tsx`（整体重构数据准备部分）
- Modify: `src/components/DetailPanel.tsx`（传 `targetId` prop）
- Modify: `src/__tests__/charts.test.tsx`（新增缓冲纯函数测试）

**Interfaces:**
- Consumes: Task 3 无直接依赖（`samples` 已是裁剪后的窗口数组）；Task 6 依赖 `targetId` prop。
- Produces: `LatencyChart` 新增必填 prop `targetId: string`；导出纯函数 `buildBuffer(targetId: string, samples: PingSample[], pingTimeoutMs: number): ChartBuffer` 与 `isPureAppend(buffer: ChartBuffer, targetId: string, pingTimeoutMs: number, samples: PingSample[]): boolean`（供测试与 Task 6 无关）。

- [ ] **Step 1: 写失败的缓冲纯函数测试**

`src/__tests__/charts.test.tsx` 顶部 import 补：

```typescript
import { buildBuffer, isPureAppend } from "../components/LatencyChart";
```

文件追加：

```typescript
describe("LatencyChart 缓冲", () => {
  const T0 = Date.parse("2026-09-08T00:00:00Z");
  function sample(id: string, index: number, status: PingSample["status"] = "success"): PingSample {
    return {
      id,
      targetId: "t1",
      sentAt: new Date(T0 + index * 5000).toISOString(),
      status,
      latencyMs: status === "success" ? 10 : null,
      errorKind: null,
    };
  }

  it("buildBuffer 映射成功/超时/错误三列", () => {
    const buffer = buildBuffer(
      "t1",
      [sample("a", 0), sample("b", 1, "timeout"), sample("c", 2, "error")],
      5000,
    );
    expect(buffer.ids).toEqual(["a", "b", "c"]);
    expect(buffer.success).toEqual([10, null, null]);
    expect(buffer.timeout).toEqual([null, 5000, null]);
    expect(buffer.xs[1] - buffer.xs[0]).toBe(5);
  });

  it("isPureAppend：纯追加为真，头删/目标切换/超时参数变化/等长为假", () => {
    const buffer = buildBuffer("t1", [sample("a", 0), sample("b", 1)], 5000);
    expect(isPureAppend(buffer, "t1", 5000, [sample("a", 0), sample("b", 1), sample("c", 2)])).toBe(true);
    expect(isPureAppend(buffer, "t1", 5000, [sample("b", 1), sample("c", 2), sample("d", 3)])).toBe(false);
    expect(isPureAppend(buffer, "t2", 5000, [sample("a", 0), sample("b", 1), sample("c", 2)])).toBe(false);
    expect(isPureAppend(buffer, "t1", 9000, [sample("a", 0), sample("b", 1), sample("c", 2)])).toBe(false);
    expect(isPureAppend(buffer, "t1", 5000, [sample("a", 0), sample("x", 1)])).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- charts`
Expected: FAIL（`buildBuffer` 未导出）

- [ ] **Step 3: 重构 LatencyChart**

`src/components/LatencyChart.tsx` 整体重写为：

```typescript
import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { PingSample } from "../types";
import type { Theme } from "../themes";

/** 图表持有的数据缓冲：与 uPlot 三列数组同引用，纯追加时原地 push */
export interface ChartBuffer {
  targetId: string;
  pingTimeoutMs: number;
  xs: number[];
  success: (number | null)[];
  timeout: (number | null)[];
  ids: string[];
}

function pushSample(buffer: ChartBuffer, sample: PingSample, pingTimeoutMs: number) {
  buffer.xs.push(new Date(sample.sentAt).getTime() / 1000);
  buffer.success.push(sample.status === "success" ? (sample.latencyMs ?? 0) : null);
  buffer.timeout.push(sample.status === "timeout" ? pingTimeoutMs : null);
  buffer.ids.push(sample.id);
}

export function buildBuffer(
  targetId: string,
  samples: PingSample[],
  pingTimeoutMs: number,
): ChartBuffer {
  const buffer: ChartBuffer = {
    targetId,
    pingTimeoutMs,
    xs: [],
    success: [],
    timeout: [],
    ids: [],
  };
  for (const sample of samples) pushSample(buffer, sample, pingTimeoutMs);
  return buffer;
}

/** 纯追加判定：目标/超时参数未变，且新数组是持有数组的纯超集（首、持有尾 id 同下标相等且长度严格增长） */
export function isPureAppend(
  buffer: ChartBuffer,
  targetId: string,
  pingTimeoutMs: number,
  samples: PingSample[],
): boolean {
  return (
    buffer.targetId === targetId &&
    buffer.pingTimeoutMs === pingTimeoutMs &&
    samples.length > buffer.ids.length &&
    samples[0]?.id === buffer.ids[0] &&
    samples[buffer.ids.length - 1]?.id === buffer.ids[buffer.ids.length - 1]
  );
}

export function LatencyChart({
  targetId,
  samples,
  pingTimeoutMs,
  theme,
}: {
  targetId: string;
  samples: PingSample[];
  pingTimeoutMs: number;
  theme: Theme;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  const bufferRef = useRef<ChartBuffer | null>(null);
  const [chartSize, setChartSize] = useState({ width: 720, height: 300 });

  useEffect(() => {
    if (!hostRef.current) return;
    const parent = hostRef.current.parentElement;
    if (!parent) return;

    const updateSize = () => {
      const availableHeight = parent.clientHeight || 300;
      setChartSize({
        width: parent.clientWidth || 720,
        height: Math.max(100, availableHeight),
      });
    };
    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(parent);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!hostRef.current) return;
    if (samples.length === 0) {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      bufferRef.current = null;
      return;
    }

    let buffer = bufferRef.current;
    if (buffer && isPureAppend(buffer, targetId, pingTimeoutMs, samples)) {
      for (const sample of samples.slice(buffer.ids.length)) {
        pushSample(buffer, sample, pingTimeoutMs);
      }
    } else {
      // 批量裁剪 / 目标切换 / 窗口变更 / 合并加载：整体重建
      buffer = buildBuffer(targetId, samples, pingTimeoutMs);
      bufferRef.current = buffer;
    }
    const data: uPlot.AlignedData = [buffer.xs, buffer.success, buffer.timeout];

    if (!chartRef.current) {
      const axisColor = theme.chartAxis;
      const gridColor = theme.chartGrid;
      const chart = new uPlot(
        {
          width: chartSize.width,
          height: chartSize.height,
          scales: { x: { time: true } },
          axes: [
            { stroke: axisColor, grid: { stroke: gridColor }, ticks: { stroke: gridColor } },
            {
              label: "ms",
              stroke: axisColor,
              grid: { stroke: gridColor },
              ticks: { stroke: gridColor },
            },
          ],
          series: [
            {},
            {
              label: "成功 (ms)",
              stroke: theme.chartSuccess,
              fill: theme.chartSuccess,
              paths: uPlot.paths.bars!({
                radius: 2,
              }),
              points: { show: false },
            },
            {
              label: "超时 (ms)",
              stroke: theme.chartTimeout,
              fill: theme.chartTimeout,
              paths: uPlot.paths.bars!({
                radius: 2,
              }),
              points: { show: false },
            },
          ],
          cursor: { drag: { x: true, y: false } },
          legend: {
            show: true,
            live: true,
          },
        },
        data,
        hostRef.current,
      );

      chartRef.current = chart;
    } else {
      chartRef.current.setData(data);
      chartRef.current.setSize({ width: chartSize.width, height: chartSize.height });
    }
  }, [samples, pingTimeoutMs, targetId, chartSize, theme]);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);

  return (
    <div className="latencyChartWrapper">
      <div className="latencyChart" ref={hostRef} />
    </div>
  );
}
```

（与旧版差异：新增 `targetId` prop 与缓冲逻辑；uPlot 配置块逐字保留；effect 依赖加入 `targetId`、`theme`。）

`src/components/DetailPanel.tsx` 的 `<LatencyChart` 增加 `targetId={status.target.id}`。

- [ ] **Step 4: 缓冲测试通过**

Run: `npm test -- charts`
Expected: PASS（uPlot jsdom 已知 unhandled error 误报除外）

- [ ] **Step 5: 全量验证**

Run: `npm test && npm run build`
Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "perf: 图表数据数组复用，增量追加与整体重建按前缀判定切换

- ChartBuffer 持有 uPlot 三列数组，纯超集前缀时原地 push 后 setData
- 头删/目标切换/超时参数变化/等长替换走整体重建
- 裁剪 tick 约每宽容度周期一次 O(W)，消除每 tick 三次全量 map"
```

---

### Task 6: 详情面板"查看全部"冻结快照模式

**Files:**
- Modify: `src/api/tauri.ts`（新增 loadAllSamples）
- Modify: `src/components/DetailPanel.tsx`（整体改造为 live/frozen 双模式）
- Modify: `src/styles.css`（snapshotActions / frozenBadge，置于 detailHeader 相关规则附近）
- Modify: `src/__tests__/charts.test.tsx`（全览交互测试）
- Modify: `README.md`（交互体验小节）

**Interfaces:**
- Consumes: Task 3 `statsView`、Task 5 `LatencyChart.targetId` prop、`api/tauri.ts` 的 `loadSamples`。
- Produces: `loadAllSamples(targetId: string): Promise<PingSample[]>`（全量取数的唯一入口，日后降采样替换点）；`DetailPanel` 新增可选 prop `onError?: (message: string) => void`。

- [ ] **Step 1: 写失败的全览交互测试**

`src/__tests__/charts.test.tsx` 顶部加 mock 与导入：

```typescript
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

const loadAllSamplesMock = vi.fn();
vi.mock("../api/tauri", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadAllSamples: (...args: unknown[]) => loadAllSamplesMock(...args),
}));
```

追加用例（放在 DetailPanel describe 内）：

```typescript
  it("查看全部：进入冻结态显示快照时间与动作，返回实时后消失", async () => {
    loadAllSamplesMock.mockResolvedValue([
      {
        id: "hist-1",
        targetId: "target-1",
        sentAt: "2026-09-01T00:00:00Z",
        status: "success",
        latencyMs: 8,
        errorKind: null,
      },
    ]);
    const status = statusWithSamples(
      {
        target: { id: "target-1", address: "192.168.1.1", alias: "Router", enabled: true, createdAt: "2026-06-18T00:00:00Z", updatedAt: "2026-06-18T00:00:00Z" },
        latestSample: null,
        consecutiveTimeouts: 0,
        alerting: false,
      },
      [],
    );
    render(
      <DetailPanel status={status} pingTimeoutSecs={5} theme={getThemeById("pure-white")} ignoreSingleTimeout={false} />,
    );

    fireEvent.click(screen.getByText("查看全部"));
    expect(await screen.findByText(/快照于/)).toBeTruthy();
    expect(loadAllSamplesMock).toHaveBeenCalledWith("target-1");

    fireEvent.click(screen.getByText("返回实时"));
    expect(screen.queryByText(/快照于/)).toBeNull();
    expect(screen.getByText("查看全部")).toBeTruthy();
  });
```

（若 setup.ts 已全局 mock `api/tauri`，与本文件的 vi.mock 合并以本文件为准——`importOriginal` 展开可保住其他导出。）

- [ ] **Step 2: 运行确认失败**

Run: `npm test -- charts`
Expected: FAIL（"查看全部"按钮不存在 / loadAllSamples 未导出）

- [ ] **Step 3: 实现 loadAllSamples 与 DetailPanel 双模式**

`src/api/tauri.ts` 在 `loadSamples` 之后加：

```typescript
/** 全览模式取全量快照；日后若改为 Rust 端分箱降采样，仅替换此实现 */
export function loadAllSamples(targetId: string) {
  return loadSamples(targetId);
}
```

`src/components/DetailPanel.tsx` 整体重写：

```typescript
import { useEffect, useState } from "react";
import type { FullStats, PingSample, TargetStatus } from "../types";
import type { Theme } from "../themes";
import { LatencyChart } from "./LatencyChart";
import { GlassCard } from "./GlassCard";
import { filterIsolatedTimeouts, statsView } from "../utils/stats";
import { loadAllSamples } from "../api/tauri";

/** 全览模式的冻结快照：样本、统计计数器与拍摄时刻一起定格 */
interface FrozenSnapshot {
  samples: PingSample[];
  stats: FullStats;
  takenAt: number;
}

export function DetailPanel({
  status,
  pingTimeoutSecs,
  theme,
  ignoreSingleTimeout,
  onError,
}: {
  status: TargetStatus;
  pingTimeoutSecs: number;
  theme: Theme;
  ignoreSingleTimeout: boolean;
  onError?: (message: string) => void;
}) {
  const [frozen, setFrozen] = useState<FrozenSnapshot | null>(null);

  useEffect(() => {
    setFrozen(null);
  }, [status.target.id]);

  const takeSnapshot = async () => {
    try {
      const samples = await loadAllSamples(status.target.id);
      setFrozen({ samples, stats: status.stats, takenAt: Date.now() });
    } catch (e) {
      onError?.((e as any)?.message ?? String(e));
    }
  };

  const visibleSamples = ignoreSingleTimeout
    ? filterIsolatedTimeouts(status.samples)
    : status.samples;
  const chartSamples = frozen ? frozen.samples : visibleSamples;
  const { avgLatency, maxLatency, timeoutCount } = statsView(
    frozen ? frozen.stats : status.stats,
    ignoreSingleTimeout,
  );

  return (
    <GlassCard className="detailShell" cornerRadius={16}>
      <div className="detailHeader">
        <div>
          <h2>{status.target.alias}</h2>
          <p>{status.target.address}</p>
        </div>
        <div className="snapshotActions">
          {frozen ? (
            <>
              <span className="frozenBadge">
                快照于 {new Date(frozen.takenAt).toLocaleTimeString()}
              </span>
              <button type="button" className="resetBtn" onClick={takeSnapshot}>
                刷新到最新
              </button>
              <button type="button" className="resetBtn" onClick={() => setFrozen(null)}>
                返回实时
              </button>
            </>
          ) : (
            <button type="button" className="resetBtn" onClick={takeSnapshot}>
              查看全部
            </button>
          )}
        </div>
        <div className="statRow">
          <span>Average {avgLatency.toFixed(1)} ms</span>
          <span>Max {maxLatency.toFixed(1)} ms</span>
          <span>Timeouts {timeoutCount}</span>
        </div>
      </div>
      <div className="chartContainer">
        {/* key 随主题变化强制重建 uPlot 实例，让系列色/坐标轴即时跟随主题 */}
        <LatencyChart
          key={theme.id}
          targetId={status.target.id}
          samples={chartSamples}
          pingTimeoutMs={pingTimeoutSecs * 1000}
          theme={theme}
        />
      </div>
    </GlassCard>
  );
}
```

`src/App.tsx` 的 `<DetailPanel` 调用处增加 `onError={(message) => setAppError(message)}`（用 `grep -n "<DetailPanel" src/App.tsx` 定位）。

- [ ] **Step 4: 样式（用主题令牌）**

`src/styles.css` 中先 `grep -n "detailHeader" src/styles.css` 定位相关规则，紧随其后加（`--theme-text-secondary` 的确切变量名以该文件既有用法为准，`grep -n "text-secondary\|textSecondary" src/styles.css` 确认后替换）：

```css
.snapshotActions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.frozenBadge {
  font-size: 12px;
  color: var(--theme-text-secondary);
}
```

禁止写死色值；`resetBtn` 沿用现有样式。

- [ ] **Step 5: 全览测试通过 + 全量验证**

Run: `npm test && npm run build`
Expected: 全部 PASS（uPlot jsdom 已知误报除外）

- [ ] **Step 6: README 更新**

README.md "### 交互体验（参考 VSCode）"小节加一条：

```
- **查看全部**：详情面板一键查看目标全历史数据（冻结快照，可框选缩放），采样与实时统计不受影响，返回实时即恢复追更
```

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 详情面板新增查看全部（冻结快照）模式

- 进入全览拍完整快照（样本+统计+时刻），图表与头部统计一并冻结
- 提供刷新到最新与返回实时；快照退出即弃，采样零影响
- loadAllSamples 隔离全量取数，为日后分箱降采样预留替换点"
```

---

## 收尾验证（全部任务完成后）

1. `npm test && npm run build && cargo test --manifest-path src-tauri/Cargo.toml` 全绿；
2. `git log --oneline` 确认六笔提交按序完整；
3. 手工验收项（需用户在 `npm run tauri dev` 执行）：设置页切换窗口档位与自定义输入；长间隔观察裁剪跳变（可临时把宽容度当 600s 验证）；查看全部 → 缩放 → 返回实时；打开大数据文件速度对比。
