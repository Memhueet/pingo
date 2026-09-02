 import type { PingSample, Target, TargetStatus } from "../types";

export function createTargetStatus(target: Target): TargetStatus {
  return {
    target,
    latestSample: null,
    consecutiveTimeouts: 0,
    alerting: false,
    samples: [],
  };
}

export function applyPingSample(
  status: TargetStatus,
  sample: PingSample,
  alerting: boolean,
): TargetStatus {
  const consecutiveTimeouts =
    sample.status === "timeout" || sample.status === "error"
      ? status.consecutiveTimeouts + 1
      : 0;

  return {
    ...status,
    latestSample: sample,
    samples: [...status.samples, sample],
    consecutiveTimeouts,
    alerting,
  };
}
