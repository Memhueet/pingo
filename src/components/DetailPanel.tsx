import { useEffect, useRef, useState } from "react";
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
  /** 快照轮次守卫：切换目标/返回实时/再次取数都会递增，迟到响应据此丢弃 */
  const snapshotEpochRef = useRef(0);

  useEffect(() => {
    snapshotEpochRef.current += 1;
    setFrozen(null);
  }, [status.target.id]);

  const takeSnapshot = async () => {
    const epoch = ++snapshotEpochRef.current;
    const targetId = status.target.id;
    try {
      const samples = await loadAllSamples(targetId);
      if (epoch !== snapshotEpochRef.current) {
        return;
      }
      setFrozen({ samples, stats: status.stats, takenAt: Date.now() });
    } catch (e) {
      if (epoch !== snapshotEpochRef.current) {
        return;
      }
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
    <GlassCard className="detailShell" cornerRadius={14}>
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
              <button type="button" className="resetBtn" onClick={() => {
                snapshotEpochRef.current += 1;
                setFrozen(null);
              }}>
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
