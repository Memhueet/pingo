import { describe, expect, it } from "vitest";
import { applyPingSample, createTargetStatus } from "../state/usePingoStore";
import type { PingSample, Target } from "../types";

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
