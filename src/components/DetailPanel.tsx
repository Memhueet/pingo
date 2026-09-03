import type { TargetStatus } from "../types";
import type { Theme } from "../themes";
import { LatencyChart } from "./LatencyChart";
import { GlassCard } from "./GlassCard";
import { calculateTargetStats } from "../utils/stats";

export function DetailPanel({
  status,
  pingTimeoutSecs,
  theme,
}: {
  status: TargetStatus;
  pingTimeoutSecs: number;
  theme: Theme;
}) {
  const { avgLatency, maxLatency, timeoutCount } = calculateTargetStats(status.samples);

  return (
    <GlassCard className="detailShell" cornerRadius={16}>
      <div className="detailHeader">
        <div>
          <h2>{status.target.alias}</h2>
          <p>{status.target.ipv4}</p>
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
          samples={status.samples}
          pingTimeoutMs={pingTimeoutSecs * 1000}
          theme={theme}
        />
      </div>
    </GlassCard>
  );
}