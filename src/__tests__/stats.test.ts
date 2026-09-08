import { describe, expect, it } from "vitest";
import {
  applySampleToStats,
  calculateTargetStats,
  emptyFullStats,
  filterIsolatedTimeouts,
  statsView,
} from "../utils/stats";
import type { PingSample, PingStatus } from "../types";

let idCounter = 0;

function sample(status: PingStatus, sentAt: string): PingSample {
  idCounter += 1;
  return {
    id: `sample-${idCounter}`,
    targetId: "target-1",
    sentAt,
    status,
    latencyMs: status === "success" ? 10 : null,
    errorKind: null,
  };
}

const ok = (t: string) => sample("success", t);
const lost = (t: string) => sample("timeout", t);

describe("filterIsolatedTimeouts", () => {
  it("keeps non-timeout samples untouched", () => {
    const samples = [ok("00:00:01"), sample("error", "00:00:02"), ok("00:00:03")];
    expect(filterIsolatedTimeouts(samples)).toEqual(samples);
  });

  it("drops a single timeout surrounded by successes", () => {
    const a = ok("00:00:01");
    const b = lost("00:00:02");
    const c = ok("00:00:03");
    expect(filterIsolatedTimeouts([a, b, c])).toEqual([a, c]);
  });

  it("keeps timeout runs of two or more", () => {
    const a = ok("00:00:01");
    const b = lost("00:00:02");
    const c = lost("00:00:03");
    const d = ok("00:00:04");
    expect(filterIsolatedTimeouts([a, b, c, d])).toEqual([a, b, c, d]);
  });

  it("drops a leading isolated timeout", () => {
    const b = lost("00:00:01");
    const c = ok("00:00:02");
    expect(filterIsolatedTimeouts([b, c])).toEqual([c]);
  });

  it("drops a trailing isolated timeout", () => {
    const a = ok("00:00:01");
    const b = lost("00:00:02");
    expect(filterIsolatedTimeouts([a, b])).toEqual([a]);
  });

  it("keeps a trailing run of two", () => {
    const a = ok("00:00:01");
    const b = lost("00:00:02");
    const c = lost("00:00:03");
    expect(filterIsolatedTimeouts([a, b, c])).toEqual([a, b, c]);
  });

  it("does not merge timeout runs across an error sample", () => {
    const a = ok("00:00:01");
    const t1 = lost("00:00:02");
    const e = sample("error", "00:00:03");
    const t2 = lost("00:00:04");
    const d = ok("00:00:05");
    // 两次超时被 error 隔断，各自孤立，均不显示
    expect(filterIsolatedTimeouts([a, t1, e, t2, d])).toEqual([a, e, d]);
  });

  it("returns empty for empty input", () => {
    expect(filterIsolatedTimeouts([])).toEqual([]);
  });
});

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
    expect(statsView(stats, false).avgLatency).toBeCloseTo(full.avgLatency);
    expect(stats.latencyMax).toBe(full.maxLatency);
    // 中间连续 2 次超时被后续成功确认计入；尾部单次待确认不计
    expect(stats.filteredTimeoutCount).toBe(2);
    expect(stats.pendingTimeoutRun).toBe(1);
  });

  it("基线延续：尾部 pending=1 时再来一次超时，pending 延续为 2，成功确认后 filtered 计入 2", () => {
    let stats = { ...emptyFullStats(), pendingTimeoutRun: 1 };
    stats = applySampleToStats(stats, makeSample({ status: "timeout", latencyMs: null }));
    expect(stats.pendingTimeoutRun).toBe(2);
    expect(stats.filteredTimeoutCount).toBe(0);
    stats = applySampleToStats(stats, makeSample({ status: "success", latencyMs: 10 }));
    expect(stats.filteredTimeoutCount).toBe(2);
    expect(stats.pendingTimeoutRun).toBe(0);
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
