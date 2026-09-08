import type { TargetStatus } from "../types";
import type { Theme } from "../themes";
import { LatencyChart } from "./LatencyChart";
import { GlassCard } from "./GlassCard";
import { filterIsolatedTimeouts, statsView } from "../utils/stats";

export function DetailPanel({
  status,
  pingTimeoutSecs,
  theme,
  ignoreSingleTimeout,
}: {
  status: TargetStatus;
  pingTimeoutSecs: number;
  theme: Theme;
  ignoreSingleTimeout: boolean;
}) {
  const visibleSamples = ignoreSingleTimeout
    ? filterIsolatedTimeouts(status.samples)
    : status.samples;
  // 头部统计读全历史计数器；图表过滤仅影响样本窗口，不回写统计
  const { avgLatency, maxLatency, timeoutCount } = statsView(
    status.stats,
    ignoreSingleTimeout,
  );

  return (
    <GlassCard className="detailShell" cornerRadius={16}>
      <div className="detailHeader">
        <div>
          <h2>{status.target.alias}</h2>
          <p>{status.target.address}</p>
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
          samples={visibleSamples}
          pingTimeoutMs={pingTimeoutSecs * 1000}
          theme={theme}
        />
      </div>
    </GlassCard>
  );
}