import { useEffect, useRef, useState } from "react";
import { GlassButton } from "./GlassButton";
import { Play, Square, FolderOpen, Plus, Download, PanelLeft, PanelRight } from "lucide-react";

export interface GlobalStats {
  total: number;
  enabled: number;
  alerting: number;
  avgLatency: number;
}

interface ToolbarProps {
  pingRunning: boolean;
  hasActiveFile: boolean;
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  stats: GlobalStats;
  onStartPing: () => void;
  onStopPing: () => void;
  onNewDataFile: () => void;
  onOpenDataFile: () => void;
  onSaveDataFileAs: () => void;
  onClearHistory: () => void;
  onToggleLeftPanel: () => void;
  onToggleRightPanel: () => void;
  currentFileName: string;
}

export function Toolbar({
  pingRunning,
  hasActiveFile,
  leftPanelVisible,
  rightPanelVisible,
  stats,
  onStartPing,
  onStopPing,
  onNewDataFile,
  onOpenDataFile,
  onSaveDataFileAs,
  onClearHistory,
  onToggleLeftPanel,
  onToggleRightPanel,
  currentFileName,
}: ToolbarProps) {
  const [fileOpen, setFileOpen] = useState(false);
  const fileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (fileRef.current && !fileRef.current.contains(e.target as Node)) {
        setFileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="topBar">
      <div className="topBarLeft">
        {hasActiveFile && (
          <>
            <GlassButton
              icon={PanelLeft}
              className={`toggle${leftPanelVisible ? " active" : ""}`}
              onClick={onToggleLeftPanel}
              title={leftPanelVisible ? "隐藏目标列表" : "显示目标列表"}
            />
            <div className="toolbarDivider" />
          </>
        )}
        <div className="titleSection">
          <h1>Pingo</h1>
          <p>IPv4 延迟监控 {currentFileName && `— ${currentFileName}`}</p>
        </div>
      </div>
      {hasActiveFile && (
        <div className="toolbarStats">
          <span className="statChip">目标 {stats.total}</span>
          <span className="statChip">启用 {stats.enabled}</span>
          <span className={`statChip${stats.alerting > 0 ? " alerting" : ""}`}>
            告警 {stats.alerting}
          </span>
          <span className="statChip">平均 {stats.avgLatency.toFixed(1)} ms</span>
        </div>
      )}
      <div className="toolbarActions">
        {hasActiveFile && (
          <>
            <div className="dropdown" ref={fileRef}>
              <GlassButton icon={FolderOpen} onClick={() => setFileOpen((v) => !v)}>
                文件 ▾
              </GlassButton>
              {fileOpen && (
                <div className="dropdownMenu">
                  <button onClick={() => { onNewDataFile(); setFileOpen(false); }}>
                    <Plus size={14} style={{ marginRight: 8 }} />
                    新建监测
                  </button>
                  <button onClick={() => { onOpenDataFile(); setFileOpen(false); }}>
                    <FolderOpen size={14} style={{ marginRight: 8 }} />
                    打开监测
                  </button>
                  <button onClick={() => { onSaveDataFileAs(); setFileOpen(false); }} disabled={!hasActiveFile}>
                    <Download size={14} style={{ marginRight: 8 }} />
                    另存为
                  </button>
                  <div className="dropdownDivider" />
                  <button onClick={() => { onClearHistory(); setFileOpen(false); }} disabled={!hasActiveFile}>
                    清空历史数据
                  </button>
                </div>
              )}
            </div>
            <GlassButton
              icon={pingRunning ? Square : Play}
              onClick={pingRunning ? onStopPing : onStartPing}
              variant={pingRunning ? "danger" : "primary"}
            >
              {pingRunning ? "停止 Ping" : "开始 Ping"}
            </GlassButton>
            <div className="toolbarDivider" />
            <GlassButton
              icon={PanelRight}
              className={`toggle${rightPanelVisible ? " active" : ""}`}
              onClick={onToggleRightPanel}
              title={rightPanelVisible ? "隐藏消息动态" : "显示消息动态"}
            />
          </>
        )}
      </div>
    </header>
  );
}
