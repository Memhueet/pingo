import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPingSample,
  createTargetStatus,
  loadAppearance,
  normalizeSettings,
  saveAppearance,
} from "../state/usePingoStore";
import type { AppSettings, PingSample, Target } from "../types";
import { defaultBackoffIntervals } from "../types";

function makeTarget(overrides?: Partial<Target>): Target {
  return {
    id: "target-1",
    ipv4: "192.168.1.1",
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
    ipv4Color: "",
    themeId: "pure-white",
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
    const updated = applyPingSample(status, sample, false);
    expect(updated.samples).toHaveLength(1);
    expect(updated.latestSample?.latencyMs).toBe(5);
    expect(updated.consecutiveTimeouts).toBe(0);
  });

  it("increments consecutive timeouts on timeout", () => {
    const status = createTargetStatus(makeTarget());
    const sample = makeSample({ status: "timeout", latencyMs: null });
    const updated = applyPingSample(status, sample, true);
    expect(updated.consecutiveTimeouts).toBe(1);
    expect(updated.alerting).toBe(true);
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
      ipv4Color: "",
    });
  });

  it("loadAppearance returns empty object when storage is empty or corrupt", () => {
    expect(loadAppearance()).toEqual({});
    localStorage.setItem("pingo.appearance", "{not json");
    expect(loadAppearance()).toEqual({});
  });

  it("normalizeSettings overlays app-level appearance over data-file values", () => {
    localStorage.setItem(
      "pingo.appearance",
      JSON.stringify({ themeId: "grass-green", aliasColor: "", ipv4Color: "" }),
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
      JSON.stringify({ themeId: "amber-brown", aliasColor: "", ipv4Color: "" }),
    );
    const normalized = normalizeSettings(makeSettings());
    expect(normalized.themeId).toBe("grass-green");
  });
});
