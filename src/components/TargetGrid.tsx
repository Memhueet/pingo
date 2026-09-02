import type { TargetStatus } from "../types";
import type { SortDirection } from "../App";
import { TargetCard } from "./TargetCard";
import { GlassButton } from "./GlassButton";
import { Plus, Upload, ArrowUpDown, Settings } from "lucide-react";

interface TargetGridProps {
  targets: TargetStatus[];
  selectedTargetId: string | null;
  selectedTargetIds: Set<string>;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  sortDirection: SortDirection;
  onSortDirectionChange: (direction: SortDirection) => void;
  onAddTarget: () => void;
  onBatchImport: () => void;
  onOpenSettings: () => void;
  hasActiveFile: boolean;
  aliasColor: string;
  ipv4Color: string;
}

export function TargetGrid({
  targets,
  selectedTargetId,
  selectedTargetIds,
  onSelect,
  onContextMenu,
  sortDirection,
  onSortDirectionChange,
  onAddTarget,
  onBatchImport,
  onOpenSettings,
  hasActiveFile,
  aliasColor,
  ipv4Color,
}: TargetGridProps) {
  return (
    <div className="targetGrid">
      {targets.length === 0 ? (
        <div className="emptyState">
          暂无目标，点击添加目标开始监控
        </div>
      ) : (
        targets.map((status) => (
          <TargetCard
            key={status.target.id}
            status={status}
            isSelected={status.target.id === selectedTargetId}
            isMultiSelected={selectedTargetIds.has(status.target.id)}
            onSelect={(e) => onSelect(status.target.id, e)}
            onContextMenu={(e) => onContextMenu(e, status.target.id)}
            aliasColor={aliasColor}
            ipv4Color={ipv4Color}
          />
        ))
      )}
      <div className="floatingActions">
        <GlassButton icon={Plus} onClick={onAddTarget} disabled={!hasActiveFile} variant="primary" title="添加目标" />
        <GlassButton icon={Upload} onClick={onBatchImport} disabled={!hasActiveFile} title="批量导入" />
        <GlassButton
          icon={ArrowUpDown}
          onClick={() => onSortDirectionChange(sortDirection === "asc" ? "desc" : "asc")}
          title={sortDirection === "asc" ? "切换为降序" : "切换为升序"}
        />
        <GlassButton icon={Settings} onClick={onOpenSettings} title="设置" />
      </div>
    </div>
  );
}