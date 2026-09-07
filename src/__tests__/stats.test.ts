import { describe, expect, it } from "vitest";
import { filterIsolatedTimeouts } from "../utils/stats";
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
