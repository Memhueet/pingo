import type { TargetStatus } from "../types";
import { GlassCard } from "./GlassCard";
import { AlertCircle } from "lucide-react";
import { statsView } from "../utils/stats";

export function TargetCard({
  status,
  isSelected,
  isMultiSelected,
  onSelect,
  onContextMenu,
  aliasColor,
  addressColor,
  ignoreSingleTimeout,
}: {
  status: TargetStatus;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  aliasColor: string;
  addressColor: string;
  ignoreSingleTimeout: boolean;
}) {
  const { avgLatency, totalCount, timeoutCount, timeoutRate, successCount } =
    statsView(status.stats, ignoreSingleTimeout);
  const state = status.alerting ? "alert" : status.target.enabled ? "ok" : "off";

  return (
    <GlassCard
      className={`targetCard status-${state}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      cornerRadius={10}
      selected={isSelected}
      multiSelected={isMultiSelected}
    >
      <div className="tcHead">
        <span className="tcIp" style={{ color: addressColor }} title={status.target.address}>
          <span className="tcDot" />
          <span className="tcIpText">{status.target.address}</span>
        </span>
        {state === "alert" && (
          <span className="tcStatus">
            <AlertCircle size={12} />
            告警
          </span>
        )}
      </div>
      <div className="tcSub">
        <span className="tcAlias" style={{ color: aliasColor }}>
          {status.target.alias || status.target.address}
        </span>
        {state === "off" ? (
          <span className="tcLatency">未探测</span>
        ) : (
          <span className="tcLatency">
            延迟{" "}
            <b>
              {status.alerting || successCount === 0
                ? "—"
                : `${avgLatency.toFixed(1)} ms`}
            </b>
          </span>
        )}
      </div>
      <div className="tcFoot">
        发送 <b>{totalCount.toLocaleString()}</b>
        <span className="tcSep">·</span>
        丢包 <b>{timeoutRate}%</b>
        <span className="tcSep">·</span>
        {status.alerting
          ? `连续超时 ${status.consecutiveTimeouts} 次`
          : `超时 ${timeoutCount} 次`}
      </div>
    </GlassCard>
  );
}
