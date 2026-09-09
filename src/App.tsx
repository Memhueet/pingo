import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import "./styles.css";
import {
  bootstrap,
  loadSamplesLatestWindow,
  onPingSample,
  saveSettings,
  saveTarget,
  setTargetEnabled,
  startPing,
  stopPing,
  updateTarget,
  deleteTarget,
  clearHistory,
  switchDataFile,
  saveDataFileAs,
  newDataFile,
  applyWindowTheme,
} from "./api/tauri";
import { DetailPanel } from "./components/DetailPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { TargetEditor } from "./components/TargetEditor";
import { TargetGrid } from "./components/TargetGrid";
import { Toolbar } from "./components/Toolbar";
import { EventLog } from "./components/EventLog";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { applyPingSample, CHART_WINDOW_HYSTERESIS_SECONDS, createTargetStatus, loadAppearance, normalizeSettings, saveAppearance, trimSamplesWindow } from "./state/usePingoStore";
import { emptyFullStats, statsView } from "./utils/stats";
import type { AppSettings, Target, TargetSaveData, TargetStatus } from "./types";
import { defaultBackoffIntervals } from "./types";
import { isValidAddress } from "./validation";
import { compareAddresses, incrementAddress, sameAddress } from "./utils/address";
import { getThemeById } from "./themes";

// 同步读取应用级外观配置，开始页首帧即呈现上次的主题，避免闪白
const savedAppearance = loadAppearance();

const defaultSettings: AppSettings = {
  pingIntervalSeconds: 5,
  pingTimeoutSeconds: 5,
  retentionDays: 7,
  alertThreshold: 3,
  // 空字符串 = 别名/IP 文字颜色跟随当前主题
  aliasColor: savedAppearance.aliasColor ?? "",
  addressColor: savedAppearance.addressColor ?? "",
  themeId: savedAppearance.themeId ?? "pure-white",
  ignoreSingleTimeout: savedAppearance.ignoreSingleTimeout ?? false,
  chartWindowSeconds: 3600,
  backoffIntervals: [...defaultBackoffIntervals],
};

export type SortMode = "ip" | "createdAt" | "latency";
export type SortDirection = "asc" | "desc";

interface LogEntry {
  id: number;
  time: Date;
  message: string;
  type: "success" | "timeout" | "error" | "info";
}

let logIdCounter = 0;

/** 破坏性操作的确认弹窗描述：确认后执行的动作一并暂存 */
interface ConfirmRequest {
  title: string;
  message: string;
  confirmText: string;
  action: () => void | Promise<void>;
}

export default function App() {
  const [settings, setSettings] = useState(defaultSettings);
  const [targets, setTargets] = useState<TargetStatus[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTarget, setEditingTarget] = useState<Target | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pingRunning, setPingRunning] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [dataFilePath, setDataFilePath] = useState<string>("");
  const [hasActiveFile, setHasActiveFile] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set());
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [batchImportText, setBatchImportText] = useState("");
  const [batchImportError, setBatchImportError] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId: string } | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [leftPanelVisible, setLeftPanelVisible] = useState(true);
  const [rightPanelVisible, setRightPanelVisible] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(260);
  const isDraggingRef = useRef<"left" | "right" | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  const handleLeftResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = "left";
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = leftPanelWidth;
  };

  const handleRightResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = "right";
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = rightPanelWidth;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current === "left") {
        const delta = e.clientX - dragStartXRef.current;
        const newWidth = Math.max(200, Math.min(600, dragStartWidthRef.current + delta));
        setLeftPanelWidth(newWidth);
      } else if (isDraggingRef.current === "right") {
        const delta = e.clientX - dragStartXRef.current;
        const newWidth = Math.max(200, Math.min(500, dragStartWidthRef.current - delta));
        setRightPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const addLog = useCallback((message: string, type: LogEntry["type"]) => {
    setLogEntries((prev) => {
      const newEntry = { id: logIdCounter++, time: new Date(), message, type };
      const updated = [...prev, newEntry];
      return updated.slice(-20);
    });
  }, []);

  const targetsRef = useRef<TargetStatus[]>([]);
  useEffect(() => {
    targetsRef.current = targets;
  }, [targets]);

  // 事件回调经 ref 读当前窗口值，避免订阅随设置变化反复重建
  const chartWindowSecondsRef = useRef(settings.chartWindowSeconds);
  useEffect(() => {
    chartWindowSecondsRef.current = settings.chartWindowSeconds;
  }, [settings.chartWindowSeconds]);

  useEffect(() => {
    let cancelled = false;

    bootstrap()
      .then((payload) => {
        if (cancelled) return;
        setSettings(normalizeSettings(payload.settings));
        setTargets(
          payload.targets.map((t) =>
            createTargetStatus(
              t,
              payload.targetStats.find((e) => e.targetId === t.id)?.stats,
            ),
          ),
        );
        setPingRunning(payload.pingRunning);
      })
      .catch((e) => {
        if (cancelled) return;
        setAppError((e as any)?.message ?? String(e));
      });

    let unlisten: (() => void) | null = null;
    onPingSample((event) => {
      if (cancelled) return;
      const currentTargets = targetsRef.current;
      const target = currentTargets.find((t) => t.target.id === event.sample.targetId);
      const targetName = target?.target.alias || target?.target.address || event.sample.targetId;

      if (event.notify) {
        // 恢复通知只会在告警后的成功样本上出现；单次/未达阈值的失败保持静默
        addLog(`${targetName} 连线恢复`, "success");
      }

      if (event.notifyAlerting) {
        addLog(`${targetName} 进入告警状态`, "error");
      }

      setTargets((current) =>
        current.map((status) =>
          status.target.id === event.sample.targetId
            ? applyPingSample(status, event.sample, event.alerting, chartWindowSecondsRef.current)
            : status,
        ),
      );
    }).then((fn) => {
      if (cancelled) { fn(); return; }
      unlisten = fn;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [addLog]);

  useEffect(() => {
    if (!selectedTargetId) return;
    let cancelled = false;
    const windowSeconds = chartWindowSecondsRef.current;
    // 锚定最新样本而非当前时刻：活跃目标≈最近窗口；历史/停用目标落在最后有数据的一段
    loadSamplesLatestWindow(
      selectedTargetId,
      windowSeconds + CHART_WINDOW_HYSTERESIS_SECONDS,
    )
      .then((loaded) => {
        if (cancelled) return;
        setTargets((current) =>
          current.map((status) => {
            if (status.target.id !== selectedTargetId) return status;
            const loadedIds = new Set(loaded.map((s) => s.id));
            const localOnly = status.samples.filter((s) => !loadedIds.has(s.id));
            const merged = trimSamplesWindow(
              [...loaded, ...localOnly],
              windowSeconds,
            );
            return {
              ...status,
              samples: merged,
              latestSample: merged[merged.length - 1] ?? status.latestSample,
            };
          }),
        );
      })
      .catch((e) => {
        if (cancelled) return;
        setAppError((e as any)?.message ?? String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTargetId, dataFilePath, settings.chartWindowSeconds]);

  const theme = useMemo(() => getThemeById(settings.themeId), [settings.themeId]);
  const effectiveAliasColor = settings.aliasColor || theme.textSecondary;
  const effectiveAddressColor = settings.addressColor || theme.text;

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(theme).forEach(([key, value]) => {
      if (key !== "id" && key !== "name" && key !== "category") {
        root.style.setProperty(`--theme-${key}`, value);
      }
    });
    // 让系统标题栏（Windows 原生装饰）跟随主题明暗
    getCurrentWindow()
      .setTheme(theme.category === "dark" ? "dark" : "light")
      .catch(() => {
        // 旧版系统不支持时忽略
      });
    // Windows 11：标题栏直接采用主题表面/文字色；其余平台为空实现
    applyWindowTheme(theme.background, theme.text).catch(() => {
      // 颜色写入失败不影响应用运行
    });
  }, [theme]);

  const selectedTarget = useMemo(
    () => targets.find((status) => status.target.id === selectedTargetId) ?? null,
    [targets, selectedTargetId],
  );

  const globalStats = useMemo(() => {
    let enabled = 0;
    let alerting = 0;
    let latencySum = 0;
    let latencyTargetCount = 0;
    for (const status of targets) {
      if (status.target.enabled) enabled++;
      if (status.alerting) alerting++;
      if (status.target.enabled) {
        const view = statsView(status.stats, settings.ignoreSingleTimeout);
        if (view.successCount > 0) {
          latencySum += view.avgLatency;
          latencyTargetCount++;
        }
      }
    }
    return {
      total: targets.length,
      enabled,
      alerting,
      avgLatency: latencyTargetCount > 0 ? latencySum / latencyTargetCount : 0,
    };
  }, [targets, settings.ignoreSingleTimeout]);

  const sortedTargets = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...targets].sort((a, b) => {
      // 停用的目标固定排在启用目标之后，不参与排序竞争
      if (a.target.enabled !== b.target.enabled) {
        return a.target.enabled ? -1 : 1;
      }
      if (sortMode === "ip") {
        return direction * compareAddresses(a.target.address, b.target.address);
      }
      if (sortMode === "createdAt") {
        return direction * (new Date(a.target.createdAt).getTime() - new Date(b.target.createdAt).getTime());
      }
      if (sortMode === "latency") {
        const avgLatency = (s: TargetStatus) =>
          s.stats.successCount > 0
            ? s.stats.latencySum / s.stats.successCount
            : Infinity;
        return direction * (avgLatency(a) - avgLatency(b));
      }
      return 0;
    });
  }, [targets, sortMode, sortDirection]);

  interface ImportedTarget {
    address: string;
    alias: string;
  }

  const handleBatchImport = async () => {
    const lines = batchImportText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const invalidIPs: string[] = [];
    const validTargets: ImportedTarget[] = [];

    for (const line of lines) {
      const parts = line.split(",");
      const ip = parts[0].trim();
      const alias = parts.length > 1 ? parts.slice(1).join(",").trim() : "";
      if (isValidAddress(ip)) {
        validTargets.push({ address: ip, alias });
      } else {
        invalidIPs.push(line);
      }
    }

    if (invalidIPs.length > 0) {
      setBatchImportError(`以下IP格式无效，请修改后再试:\n${invalidIPs.join("\n")}`);
      return;
    }

    const existingIPs = new Set(targets.map((t) => t.target.address));
    let addedCount = 0;
    let skippedCount = 0;

    for (const target of validTargets) {
      if (existingIPs.has(target.address)) {
        skippedCount++;
        continue;
      }
      try {
        const t = await saveTarget({ address: target.address, alias: target.alias });
        setTargets((current) => [...current, createTargetStatus(t)]);
        addedCount++;
      } catch (e) {
        console.error("Failed to add target:", e);
      }
    }

    setShowBatchImport(false);
    setBatchImportText("");
    setBatchImportError(null);
    addLog(`批量导入完成: 成功 ${addedCount} 条, 重复跳过 ${skippedCount} 条`, "info");
  };

  const handleContextMenu = (e: React.MouseEvent, targetId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, targetId });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleCardClick = (targetId: string, e: React.MouseEvent) => {
    if (e.metaKey) {
      setSelectedTargetIds((prev) => {
        const next = new Set(prev);
        if (next.has(targetId)) {
          next.delete(targetId);
        } else {
          next.add(targetId);
        }
        return next;
      });
    } else if (e.shiftKey) {
      const targetIds = sortedTargets.map((s) => s.target.id);
      const clickedIdx = targetIds.indexOf(targetId);
      const lastSelected = Array.from(selectedTargetIds);
      if (lastSelected.length === 0) {
        setSelectedTargetIds(new Set([targetId]));
        setSelectedTargetId(targetId);
        return;
      }
      const lastIdx = targetIds.indexOf(lastSelected[lastSelected.length - 1]);
      const start = Math.min(clickedIdx, lastIdx);
      const end = Math.max(clickedIdx, lastIdx);
      const rangeIds = new Set(targetIds.slice(start, end + 1));
      setSelectedTargetIds(rangeIds);
      setSelectedTargetId(targetId);
    } else {
      setSelectedTargetId(targetId);
      setSelectedTargetIds(new Set([targetId]));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedTargetIds.size === 0) return;
    const count = selectedTargetIds.size;
    try {
      for (const id of selectedTargetIds) {
        await deleteTarget(id);
      }
      setTargets((current) => current.filter((s) => !selectedTargetIds.has(s.target.id)));
      if (selectedTargetIds.has(selectedTargetId ?? "")) {
        setSelectedTargetId(null);
      }
      setSelectedTargetIds(new Set());
      closeContextMenu();
      addLog(`批量删除了 ${count} 个目标`, "info");
    } catch (e) {
      setAppError((e as any)?.message ?? String(e));
    }
  };

  /** 复制单个目标：IP 末段 +1（满则回绕 1），新 IP 已存在则失败 */
  const handleDuplicateTarget = async (source: TargetStatus) => {
    const newAddress = incrementAddress(source.target.address);
    if (targets.some((t) => sameAddress(t.target.address, newAddress))) {
      setAppError(`复制失败：${newAddress} 已存在`);
      return;
    }
    try {
      const t = await saveTarget({ address: newAddress, alias: source.target.alias });
      setTargets((current) => [...current, createTargetStatus(t)]);
      addLog(`已复制目标 ${source.target.address} → ${newAddress}`, "info");
    } catch (e) {
      setAppError((e as any)?.message ?? String(e));
    }
  };

  /** 批量复制：各族（IPv4/IPv6）以族内最大的 IP 为起点顺序分配，任一重复则整批失败 */
  const handleBatchDuplicateTargets = async () => {
    if (selectedTargetIds.size === 0) return;
    const sources = targets
      .filter((s) => selectedTargetIds.has(s.target.id))
      .sort((a, b) => compareAddresses(a.target.address, b.target.address));
    const groups = new Map<boolean, TargetStatus[]>();
    for (const source of sources) {
      const isV6 = source.target.address.includes(":");
      const list = groups.get(isV6) ?? [];
      list.push(source);
      groups.set(isV6, list);
    }
    const existing = targets.map((t) => t.target.address);
    const assignments = new Map<TargetStatus, string>();
    for (const list of groups.values()) {
      const maxSource = list.reduce((max, s) =>
        compareAddresses(s.target.address, max.target.address) > 0 ? s : max,
      );
      let next = incrementAddress(maxSource.target.address);
      for (const source of list) {
        if (
          existing.some((addr) => sameAddress(addr, next)) ||
          [...assignments.values()].some((addr) => sameAddress(addr, next))
        ) {
          setAppError(`批量复制失败：${next} 已存在`);
          return;
        }
        assignments.set(source, next);
        next = incrementAddress(next);
      }
    }
    try {
      for (const source of sources) {
        const address = assignments.get(source);
        if (address === undefined) continue;
        const t = await saveTarget({ address, alias: source.target.alias });
        setTargets((current) => [...current, createTargetStatus(t)]);
      }
      addLog(`批量复制了 ${sources.length} 个目标`, "info");
    } catch (e) {
      setAppError((e as any)?.message ?? String(e));
    }
  };

  const handleBatchToggle = async (enable: boolean) => {
    if (selectedTargetIds.size === 0) return;
    const count = selectedTargetIds.size;
    try {
      for (const id of selectedTargetIds) {
        const target = targets.find((t) => t.target.id === id);
        if (!target || target.target.enabled === enable) continue;
        const updated = await setTargetEnabled(id, enable);
        setTargets((current) =>
          current.map((s) => (s.target.id === updated.id ? { ...s, target: updated } : s)),
        );
      }
      addLog(`批量${enable ? "启用" : "禁用"}了 ${count} 个目标`, "info");
      closeContextMenu();
    } catch (e) {
      setAppError((e as any)?.message ?? String(e));
    }
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const menu = document.querySelector(".contextMenu");
      if (menu && menu.contains(e.target as Node)) return;
      closeContextMenu();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleNewDataFile = async () => {
    try {
      const dirPath = await open({
        multiple: false,
        directory: true,
      });
      if (typeof dirPath !== "string") return;
      const now = new Date();
      const fileName = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}-pingo-history.db`;
      const filePath = `${dirPath}/${fileName}`;
      const payload = await newDataFile(filePath);
      setTargets(
        payload.targets.map((t) =>
          createTargetStatus(
            t,
            payload.targetStats.find((e) => e.targetId === t.id)?.stats,
          ),
        ),
      );
      setSettings(normalizeSettings(payload.settings));
      setPingRunning(payload.pingRunning);
      setSelectedTargetId(null);
      setSelectedTargetIds(new Set());
      setDataFilePath(dirPath.split("/").pop() || dirPath);
      setHasActiveFile(true);
      setLogEntries([]);
      addLog("已新建监测数据文件", "info");
    } catch (e) {
      setAppError((e as any)?.message ?? String(e));
    }
  };

  const handleOpenDataFile = async () => {
    try {
      const path = await open({ multiple: false, directory: false });
      if (typeof path !== "string") return;
      const fileName = path.split("/").pop();
      if (!fileName || !fileName.includes("pingo-history")) {
        alert("请选择有效的 Pingo 数据库文件（文件名应包含 'pingo-history'）");
        return;
      }
      const payload = await switchDataFile(path);
      const initialTargets = payload.targets.map((t) =>
        createTargetStatus(
          t,
          payload.targetStats.find((e) => e.targetId === t.id)?.stats,
        ),
      );
      setTargets(initialTargets);
      setSettings(normalizeSettings(payload.settings));
      setPingRunning(payload.pingRunning);
      setSelectedTargetId(null);
      setSelectedTargetIds(new Set());
      const dirPath = path.substring(0, path.lastIndexOf("/"));
      setDataFilePath(dirPath.split("/").pop() || dirPath);
      setHasActiveFile(true);
      setLogEntries([]);
      addLog("已打开监测数据文件", "info");
    } catch (e) {
      setAppError((e as any)?.message ?? String(e));
    }
  };

  const handleSaveDataFileAs = async () => {
    try {
      const dirPath = await open({
        multiple: false,
        directory: true,
      });
      if (typeof dirPath !== "string") return;
      const now = new Date();
      const fileName = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}-pingo-history.db`;
      const filePath = `${dirPath}/${fileName}`;
      await saveDataFileAs(filePath);
      setDataFilePath(dirPath.split("/").pop() || dirPath);
      addLog("已另存为新的数据文件", "info");
    } catch (e) {
      setAppError((e as any)?.message ?? String(e));
    }
  };

  const handleClearHistory = async () => {
    try {
      await clearHistory();
      setTargets((current) =>
        current.map((s) => ({
          ...s,
          samples: [],
          latestSample: null,
          stats: emptyFullStats(),
        })),
      );
      addLog("已清空所有历史数据", "info");
    } catch (e) {
      setAppError((e as any)?.message ?? String(e));
    }
  };

  /** 破坏性操作一律先经确认弹窗（原生 confirm 在 WebView 中不可用） */
  const requestClearHistory = () => {
    setConfirmRequest({
      title: "清空历史数据",
      message: "将删除所有目标的全部 Ping 历史记录，目标配置会保留。此操作不可撤销。",
      confirmText: "清空",
      action: handleClearHistory,
    });
  };

  const requestBatchDelete = () => {
    const count = selectedTargetIds.size;
    closeContextMenu();
    setConfirmRequest({
      title: "删除目标",
      message: `将删除选中的 ${count} 个目标及其全部历史数据。此操作不可撤销。`,
      confirmText: "删除",
      action: handleBatchDelete,
    });
  };

  return (
    <main className="appShell">
      <Toolbar
        pingRunning={pingRunning}
        hasActiveFile={hasActiveFile}
        leftPanelVisible={leftPanelVisible}
        rightPanelVisible={rightPanelVisible}
        stats={globalStats}
        onToggleLeftPanel={() => setLeftPanelVisible((v) => !v)}
        onToggleRightPanel={() => setRightPanelVisible((v) => !v)}
        onStartPing={async () => {
          if (!hasActiveFile) {
            alert("请先新建或打开一个监测数据文件");
            return;
          }
          if (targets.length === 0) {
            alert("请先添加目标后再开始 ping");
            return;
          }
          try {
            await startPing();
            setPingRunning(true);
            addLog("开始Ping监控", "info");
          } catch (e) {
            setAppError((e as any)?.message ?? String(e));
          }
        }}
        onStopPing={async () => {
          try {
            await stopPing();
            setPingRunning(false);
            addLog("停止Ping监控", "info");
          } catch (e) {
            setAppError((e as any)?.message ?? String(e));
          }
        }}
        onNewDataFile={handleNewDataFile}
        onOpenDataFile={handleOpenDataFile}
        onSaveDataFileAs={handleSaveDataFileAs}
        onClearHistory={requestClearHistory}
        currentFileName={dataFilePath}
      />
      {appError ? <div className="appError">{appError}</div> : null}

      {!hasActiveFile ? (
        <div className="welcomeScreen">
          <div className="welcomeCard">
            <h1>Pingo</h1>
            <p className="welcomeSubtitle">轻量的 Ping 监控工具</p>
            <div className="welcomeActions">
              <button className="welcomeBtn primary" onClick={handleNewDataFile}>
                新建监测
              </button>
              <button className="welcomeBtn" onClick={handleOpenDataFile}>
                打开已有监测
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mainContent">
        {leftPanelVisible && (
          <aside className="targetListPanel" style={{ width: leftPanelWidth, minWidth: 0 }}>
            <div className="panelHeader">
              <span>目标 ({targets.length})</span>
            </div>
            <TargetGrid
              targets={sortedTargets}
              selectedTargetId={selectedTargetId}
              selectedTargetIds={selectedTargetIds}
              onSelect={(id, e) => handleCardClick(id, e)}
              onContextMenu={handleContextMenu}
              sortDirection={sortDirection}
              onSortDirectionChange={setSortDirection}
              onAddTarget={() => setShowEditor(true)}
              onBatchImport={() => setShowBatchImport(true)}
              onOpenSettings={() => setShowSettings(true)}
              hasActiveFile={hasActiveFile}
              aliasColor={effectiveAliasColor}
              addressColor={effectiveAddressColor}
              ignoreSingleTimeout={settings.ignoreSingleTimeout}
            />
          </aside>
        )}

        {leftPanelVisible && (
          <div
            className="resizeHandle resizeHandleLeft"
            onMouseDown={handleLeftResizeStart}
          />
        )}

        <section className="detailPanel">
          {selectedTarget ? (
            <DetailPanel
              status={selectedTarget}
              pingTimeoutSecs={settings.pingTimeoutSeconds}
              theme={theme}
              ignoreSingleTimeout={settings.ignoreSingleTimeout}
              onError={(message) => setAppError(message)}
            />
          ) : (
            <div className="emptyDetail">选择目标查看详情</div>
          )}
        </section>

        {rightPanelVisible && (
          <div
            className="resizeHandle resizeHandleRight"
            onMouseDown={handleRightResizeStart}
          />
        )}

        {rightPanelVisible && (
          <aside className="eventLogPanel" style={{ width: rightPanelWidth, minWidth: 0 }}>
            <EventLog entries={logEntries} />
          </aside>
        )}
        </div>
      )}

      {contextMenu && (
        <div
          className="contextMenu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const target = targets.find((t) => t.target.id === contextMenu.targetId);
            if (selectedTargetIds.size > 1) {
              return (
                <>
                  <div className="contextMenuLabel">
                    已选 {selectedTargetIds.size} 个目标
                  </div>
                  <button onClick={() => handleBatchToggle(true)}>
                    批量启用
                  </button>
                  <button onClick={() => handleBatchToggle(false)}>
                    批量禁用
                  </button>
                  <button
                    onClick={() => {
                      closeContextMenu();
                      void handleBatchDuplicateTargets();
                    }}
                  >
                    批量复制
                  </button>
                  <button className="deleteMenuItem" onClick={requestBatchDelete}>
                    批量删除
                  </button>
                </>
              );
            }
            return (
              <>
                <button
                  onClick={() => {
                    if (target) {
                      setEditingTarget(target.target);
                      setShowEditor(true);
                    }
                    closeContextMenu();
                  }}
                >
                  编辑
                </button>
                <button
                  onClick={() => {
                    if (target) {
                      setTargetEnabled(contextMenu.targetId, !target.target.enabled)
                        .then((updated) => {
                          setTargets((current) =>
                            current.map((s) =>
                              s.target.id === updated.id ? { ...s, target: updated } : s,
                            ),
                          );
                        })
                        .catch((e) => setAppError((e as any)?.message ?? String(e)));
                    }
                    closeContextMenu();
                  }}
                >
                  {target?.target.enabled ? "禁用" : "启用"}
                </button>
                <button
                  onClick={() => {
                    if (target) {
                      closeContextMenu();
                      void handleDuplicateTarget(target);
                    }
                  }}
                >
                  复制
                </button>
                <button
                  className="deleteMenuItem"
                  onClick={() => {
                    if (!target || !contextMenu) return;
                    const targetId = contextMenu.targetId;
                    const address = target.target.address;
                    closeContextMenu();
                    setConfirmRequest({
                      title: "删除目标",
                      message: `将删除目标 ${address} 及其全部历史数据。此操作不可撤销。`,
                      confirmText: "删除",
                      action: async () => {
                        try {
                          await deleteTarget(targetId);
                          setTargets((current) =>
                            current.filter((s) => s.target.id !== targetId),
                          );
                          if (selectedTargetId === targetId) setSelectedTargetId(null);
                        } catch (e) {
                          setAppError((e as any)?.message ?? String(e));
                        }
                      },
                    });
                  }}
                >
                  删除
                </button>
              </>
            );
          })()}
        </div>
      )}

      {confirmRequest && (
        <ConfirmDialog
          title={confirmRequest.title}
          message={confirmRequest.message}
          confirmText={confirmRequest.confirmText}
          onConfirm={() => {
            const { action } = confirmRequest;
            setConfirmRequest(null);
            void action();
          }}
          onCancel={() => setConfirmRequest(null)}
        />
      )}

      {showBatchImport && (
        <div className="modalOverlay">
          <div className="modalPanel">
            <h3>批量导入IP</h3>
            <p>每行一个IP，可选添加别名（格式: IP,别名）</p>
            <textarea
              value={batchImportText}
              onChange={(e) => setBatchImportText(e.target.value)}
              onKeyDown={(e) => {
                // 多行输入框中裸回车用于换行，Ctrl/⌘+Enter 快捷确认导入
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleBatchImport();
                }
              }}
              placeholder="192.168.1.1
192.168.1.2,服务器1
10.0.0.1"
              rows={15}
            />
            {batchImportError && <div className="formError">{batchImportError}</div>}
            <div className="panelActions">
              <button onClick={() => setShowBatchImport(false)}>取消</button>
              <button onClick={handleBatchImport} className="primaryBtn">确认导入</button>
            </div>
          </div>
        </div>
      )}

      {showEditor ? (
        <TargetEditor
          target={editingTarget ?? undefined}
          onClose={() => {
            setShowEditor(false);
            setEditingTarget(null);
          }}
          onSave={async (payload: TargetSaveData) => {
            try {
              if (payload.id) {
                const updated = await updateTarget(payload.id, payload.address, payload.alias);
                setTargets((current) =>
                  current.map((s) =>
                    s.target.id === updated.id
                      ? { ...s, target: updated }
                      : s,
                  ),
                );
              } else {
                const t = await saveTarget(payload);
                setTargets((current) => [
                  ...current,
                  createTargetStatus(t),
                ]);
              }
              setShowEditor(false);
              setEditingTarget(null);
            } catch (e) {
              setAppError((e as any)?.message ?? String(e));
            }
          }}
        />
      ) : null}
      {showSettings ? (
        <SettingsPanel
          settings={settings}
          sortMode={sortMode}
          onClose={() => setShowSettings(false)}
          onSave={async (next) => {
            try {
              saveAppearance(next);
              const saved = await saveSettings(next);
              setSettings(normalizeSettings(saved));
              setShowSettings(false);
            } catch (e) {
              setAppError((e as any)?.message ?? String(e));
            }
          }}
          onSortModeChange={setSortMode}
        />
      ) : null}
    </main>
  );
}
