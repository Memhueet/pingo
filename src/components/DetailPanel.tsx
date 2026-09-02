import type { TargetStatus } from "../types";
import { LatencyChart } from "./LatencyChart";
import { GlassCard } from "./GlassCard";
import { calculateTargetStats } from "../utils/stats";

export function DetailPanel({
  status,
  pingTimeoutSecs,
}: {
  status: TargetStatus;
  pingTimeoutSecs: number;
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
        <LatencyChart
          samples={status.samples}
          pingTimeoutMs={pingTimeoutSecs * 1000}
        />
      </div>
    </GlassCard>
  );
}