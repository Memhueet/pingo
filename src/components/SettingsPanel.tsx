import { useState } from "react";
import type { AppSettings } from "../types";
import type { SortMode } from "../App";
import { X, Save, Sun, Moon, Cloud, Sliders, Palette } from "lucide-react";
import { themes } from "../themes";

interface SettingsPanelProps {
  settings: AppSettings;
  sortMode: SortMode;
  onClose: () => void;
  onSave: (next: AppSettings) => void;
  onSortModeChange: (mode: SortMode) => void;
}

type TabType = "general" | "appearance";

export function SettingsPanel({ settings, sortMode, onClose, onSave, onSortModeChange }: SettingsPanelProps) {
  const [draft, setDraft] = useState({ ...settings });
  const [activeTab, setActiveTab] = useState<TabType>("general");

  function setNumber(field: keyof AppSettings, value: string) {
    const num = value === "" ? 0 : Number(value);
    setDraft({ ...draft, [field]: num });
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "light":
        return <Sun size={12} />;
      case "dark":
        return <Moon size={12} />;
      default:
        return <Cloud size={12} />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "light":
        return "明亮";
      case "dark":
        return "夜间";
      default:
        return "中性";
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "常规", icon: <Sliders size={14} /> },
    { id: "appearance", label: "外观", icon: <Palette size={14} /> },
  ];

  return (
    <div className="modalOverlay">
      <div className="modalPanel">
        <div className="panelHeaderRow">
          <h3>设置</h3>
          <button type="button" className="closeBtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="settingsTabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`settingsTab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        <div className="settingsContent">
          {activeTab === "general" && (
            <div className="settingsTabContent">
              <label>
                排序方式
                <select
                  value={sortMode}
                  onChange={(e) => onSortModeChange(e.target.value as SortMode)}
                  className="sortSelect"
                >
                  <option value="createdAt">按添加时间</option>
                  <option value="ip">按IP</option>
                  <option value="latency">按延迟</option>
                </select>
              </label>
              <label>
                Ping 间隔 (秒)
                <input
                  type="number"
                  min="1"
                  value={draft.pingIntervalSeconds}
                  onChange={(event) => setNumber("pingIntervalSeconds", event.target.value)}
                />
              </label>
              <label>
                Ping 超时 (秒)
                <input
                  type="number"
                  min="1"
                  value={draft.pingTimeoutSeconds}
                  onChange={(event) => setNumber("pingTimeoutSeconds", event.target.value)}
                />
              </label>
              <label>
                历史保留天数
                <input
                  type="number"
                  min="1"
                  value={draft.retentionDays}
                  onChange={(event) => setNumber("retentionDays", event.target.value)}
                />
              </label>
              <label>
                告警阈值
                <input
                  type="number"
                  min="1"
                  value={draft.alertThreshold}
                  onChange={(event) => setNumber("alertThreshold", event.target.value)}
                />
              </label>
            </div>
          )}
          {activeTab === "appearance" && (
            <div className="settingsTabContent">
              <label>
                主题皮肤
                <div className="themeGrid">
                  {themes.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      className={`themeCard ${draft.themeId === theme.id ? "selected" : ""}`}
                      onClick={() => setDraft({ ...draft, themeId: theme.id })}
                      style={{
                        "--theme-preview-bg": theme.background,
                        "--theme-preview-panel": theme.panelBackground,
                        "--theme-preview-card": theme.cardBackground,
                        "--theme-preview-text": theme.text,
                        "--theme-preview-border": theme.border,
                        "--theme-preview-accent": theme.accent,
                      } as React.CSSProperties}
                    >
                      <div className="themePreview">
                        <div className="previewHeader">
                          <div className="previewDot" style={{ background: theme.accent }}></div>
                          <div className="previewDot" style={{ background: theme.success }}></div>
                          <div className="previewDot" style={{ background: theme.timeout }}></div>
                        </div>
                        <div className="previewContent">
                          <div className="previewCard"></div>
                        </div>
                      </div>
                      <div className="themeInfo">
                        <span className="themeName">{theme.name}</span>
                        <span className="themeCategory">{getCategoryIcon(theme.category)} {getCategoryLabel(theme.category)}</span>
                      </div>
                      {draft.themeId === theme.id && (
                        <div className="themeCheck">✓</div>
                      )}
                    </button>
                  ))}
                </div>
              </label>
              <label>
                别名颜色
                <div className="colorPickerRow">
                  <input
                    type="color"
                    value={draft.aliasColor}
                    onChange={(event) => setDraft({ ...draft, aliasColor: event.target.value })}
                  />
                  <input
                    type="text"
                    value={draft.aliasColor}
                    onChange={(event) => setDraft({ ...draft, aliasColor: event.target.value })}
                    className="colorInput"
                  />
                </div>
              </label>
              <label>
                IP 地址颜色
                <div className="colorPickerRow">
                  <input
                    type="color"
                    value={draft.ipv4Color}
                    onChange={(event) => setDraft({ ...draft, ipv4Color: event.target.value })}
                  />
                  <input
                    type="text"
                    value={draft.ipv4Color}
                    onChange={(event) => setDraft({ ...draft, ipv4Color: event.target.value })}
                    className="colorInput"
                  />
                </div>
              </label>
            </div>
          )}
        </div>
        <div className="panelActions">
          <button onClick={onClose}>取消</button>
          <button
            onClick={() => onSave(draft)}
            className="primaryBtn"
          >
            <Save size={14} style={{ marginRight: 6 }} />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}