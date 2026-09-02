import { useEffect, useRef, useState } from "react";
import { GlassButton } from "./GlassButton";
import { Play, Square, FolderOpen, Plus, Download } from "lucide-react";

interface ToolbarProps {
  pingRunning: boolean;
  hasActiveFile: boolean;
  onStartPing: () => void;
  onStopPing: () => void;
  onNewDataFile: () => void;
  onOpenDataFile: () => void;
  onSaveDataFileAs: () => void;
  onClearHistory: () => void;
  currentFileName: string;
}

export function Toolbar({
  pingRunning,
  hasActiveFile,
  onStartPing,
  onStopPing,
  onNewDataFile,
  onOpenDataFile,
  onSaveDataFileAs,
  onClearHistory,
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
    <header className={`topBar ${pingRunning ? "pingRunning" : ""}`}>
      <div className="titleSection">
        <h1>Pingo</h1>
        <p>IPv4 延迟监控 {currentFileName && `— ${currentFileName}`}</p>
      </div>
      <div className="toolbarActions">
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
      </div>
    </header>
  );
}