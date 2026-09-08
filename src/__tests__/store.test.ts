import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPingSample,
  createTargetStatus,
  loadAppearance,
  normalizeSettings,
  saveAppearance,
  trimSamplesWindow,
} from "../state/usePingoStore";
import type { AppSettings, PingSample, Target } from "../types";
import { defaultBackoffIntervals } from "../types";

function makeTarget(overrides?: Partial<Target>): Target {
  return {
    id: "target-1",
    address: "192.168.1.1",
    alias: "Router",
    enabled: true,
    createdAt: "2026-06-18T00:00:00Z",
    updatedAt: "2026-06-18T00:00:00Z",
    ...overrides,
  };
}

function makeSettings(overrides?: Partial<AppSettings>): AppSettings {
  return {
    pingIntervalSeconds: 5,
    pingTimeoutSeconds: 5,
    retentionDays: 7,
    alertThreshold: 3,
    aliasColor: "",
    addressColor: "",
    themeId: "pure-white",
    ignoreSingleTimeout: false,
    chartWindowSeconds: 3600,
    backoffIntervals: [...defaultBackoffIntervals],
    ...overrides,
  };
}

function makeSample(overrides?: Partial<PingSample>): PingSample {
  return {
    id: "sample-1",
    targetId: "target-1",
    sentAt: "2026-06-18T00:00:00Z",
    status: "success",
    latencyMs: 10,
    errorKind: null,
    ...overrides,
  };
}

function sampleAt(index: number, overrides?: Partial<PingSample>): PingSample {
  return makeSample({
    id: `sample-${index}`,
    sentAt: new Date(Date.parse("2026-06-18T00:00:00Z") + index * 5000).toISOString(),
    ...overrides,
  });
}

describe("createTargetStatus", () => {
  it("creates initial status with empty samples", () => {
    const target = makeTarget();
    const status = createTargetStatus(target);
    expect(status.target.id).toBe("target-1");
    expect(status.samples).toEqual([]);
    expect(status.latestSample).toBeNull();
    expect(status.alerting).toBe(false);
  });
});

describe("applyPingSample", () => {
  it("adds sample and resets timeouts on success", () => {
    const status = createTargetStatus(makeTarget());
    const sample = makeSample({ status: "success", latencyMs: 5 });
    const updated = applyPingSample(status, sample, false, 3600);
    expect(updated.samples).toHaveLength(1);
    expect(updated.latestSample?.latencyMs).toBe(5);
    expect(updated.consecutiveTimeouts).toBe(0);
  });

  it("increments consecutive timeouts on timeout", () => {
    const status = createTargetStatus(makeTarget());
    const sample = makeSample({ status: "timeout", latencyMs: null });
    const updated = applyPingSample(status, sample, true, 3600);
    expect(updated.consecutiveTimeouts).toBe(1);
    expect(updated.alerting).toBe(true);
  });
});

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
    // 间隔 20s × 40 条 = 跨度 780s > 60+600=660s
    const samples = Array.from({ length: 40 }, (_, i) => sampleAt(i * 4));
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
      const sample = sampleAt(i * 4, i % 10 === 0 ? { status: "timeout" as const, latencyMs: null } : {});
      samples = [...samples, sample];
      status = applyPingSample(status, sample, false, W);
    }
    expect(status.samples.length).toBeLessThan(40);
    expect(status.stats.totalCount).toBe(40);
    expect(status.stats.timeoutCount).toBe(4);
  });
});

describe("appearance app-level storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saveAppearance writes and loadAppearance reads back", () => {
    saveAppearance(makeSettings({ themeId: "grass-green", aliasColor: "#112233" }));
    expect(loadAppearance()).toEqual({
      themeId: "grass-green",
      aliasColor: "#112233",
      addressColor: "",
      ignoreSingleTimeout: false,
    });
  });

  it("ignoreSingleTimeout 持久化并在 normalizeSettings 时覆盖", () => {
    saveAppearance(makeSettings({ ignoreSingleTimeout: true }));
    expect(loadAppearance().ignoreSingleTimeout).toBe(true);
    expect(normalizeSettings(makeSettings()).ignoreSingleTimeout).toBe(true);
  });

  it("ignoreSingleTimeout 在应用级配置缺省时默认关闭", () => {
    expect(normalizeSettings(makeSettings()).ignoreSingleTimeout).toBe(false);
  });

  it("loadAppearance returns empty object when storage is empty or corrupt", () => {
    expect(loadAppearance()).toEqual({});
    localStorage.setItem("pingo.appearance", "{not json");
    expect(loadAppearance()).toEqual({});
  });

  it("loadAppearance 回退读取旧版 ipv4Color 字段", () => {
    localStorage.setItem(
      "pingo.appearance",
      JSON.stringify({ themeId: "grass-green", aliasColor: "", ipv4Color: "#123456" }),
    );
    const appearance = loadAppearance();
    expect(appearance.addressColor).toBe("#123456");
  });

  it("normalizeSettings overlays app-level appearance over data-file values", () => {
    localStorage.setItem(
      "pingo.appearance",
      JSON.stringify({ themeId: "grass-green", aliasColor: "", addressColor: "" }),
    );
    const normalized = normalizeSettings(makeSettings({ themeId: "pure-white" }));
    expect(normalized.themeId).toBe("grass-green");
  });

  it("normalizeSettings keeps data-file appearance when app-level storage is empty", () => {
    const normalized = normalizeSettings(makeSettings({ themeId: "gray-blue" }));
    expect(normalized.themeId).toBe("gray-blue");
  });

  it("normalizeSettings migrates renamed theme id from app-level appearance", () => {
    localStorage.setItem(
      "pingo.appearance",
      JSON.stringify({ themeId: "amber-brown", aliasColor: "", addressColor: "" }),
    );
    const normalized = normalizeSettings(makeSettings());
    expect(normalized.themeId).toBe("grass-green");
  });
});
