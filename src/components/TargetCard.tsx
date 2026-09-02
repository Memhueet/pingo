import type { TargetStatus } from "../types";
import { GlassCard } from "./GlassCard";
import { CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { calculateTargetStats } from "../utils/stats";

export function TargetCard({
  status,
  isSelected,
  isMultiSelected,
  onSelect,
  onContextMenu,
  aliasColor,
  ipv4Color,
}: {
  status: TargetStatus;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  aliasColor: string;
  ipv4Color: string;
}) {
  const { avgLatency, totalCount, timeoutCount, timeoutRate } = calculateTargetStats(status.samples);

  const getStatusIcon = () => {
    if (status.alerting) return <AlertCircle size={14} className="alertIcon" />;
    if (status.target.enabled) return <CheckCircle size={14} className="enabledIcon" />;
    return <XCircle size={14} className="disabledIcon" />;
  };

  return (
    <GlassCard
      className={`targetCard${status.alerting ? " alert" : ""}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      cornerRadius={10}
      selected={isSelected}
      multiSelected={isMultiSelected}
    >
      <div className="targetCardBody">
        <div className="targetCardHeader">
          <strong style={{ color: aliasColor }}>{status.target.alias || status.target.ipv4}</strong>
          <span style={{ color: ipv4Color }}>{status.target.ipv4}</span>
        </div>
        <div className="targetStats">
          <span>Avg {avgLatency.toFixed(1)} ms</span>
          <span>Sent {totalCount}</span>
          <span>Timeouts {timeoutCount}</span>
          <span>Rate {timeoutRate}%</span>
        </div>
      </div>
      <div className="targetStatusIndicator">
        {getStatusIcon()}
      </div>
    </GlassCard>
  );
}