import type { PingSample } from "../types";

export interface TargetStats {
  successes: PingSample[];
  timeoutCount: number;
  totalCount: number;
  avgLatency: number;
  maxLatency: number;
  timeoutRate: string;
}

export function calculateTargetStats(samples: PingSample[]): TargetStats {
  const successes = samples.filter(
    (s) => s.status === "success" && s.latencyMs != null,
  );
  const totalCount = samples.length;
  const timeoutCount = samples.filter(
    (s) => s.status === "timeout",
  ).length;
  const avgLatency =
    successes.length > 0
      ? successes.reduce((sum, s) => sum + (s.latencyMs ?? 0), 0) /
        successes.length
      : 0;
  const maxLatency = successes.length > 0
    ? Math.max(...successes.map((s) => s.latencyMs ?? 0))
    : 0;
  const timeoutRate =
    totalCount > 0 ? ((timeoutCount / totalCount) * 100).toFixed(1) : "0.0";

  return {
    successes,
    timeoutCount,
    totalCount,
    avgLatency,
    maxLatency,
    timeoutRate,
  };
}