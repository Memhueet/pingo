import type { PingSample } from "../types";

/**
 * 忽略单次超时：按 sentAt 顺序扫描，只保留属于"连续 ≥2 次超时"运行的超时样本，
 * 孤立的超时（前后都是非超时样本）被过滤，成功与错误样本原样保留。
 * 末尾刚出现的单次超时在等到下一次超时确认前同样隐藏。
 */
export function filterIsolatedTimeouts(samples: PingSample[]): PingSample[] {
  const kept: PingSample[] = [];
  let run: PingSample[] = [];
  const flushRun = () => {
    if (run.length >= 2) {
      kept.push(...run);
    }
    run = [];
  };
  for (const sample of samples) {
    if (sample.status === "timeout") {
      run.push(sample);
    } else {
      flushRun();
      kept.push(sample);
    }
  }
  flushRun();
  return kept;
}

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