import { useState, useEffect } from "react";
import type { AppSettings } from "../types";
import { defaultBackoffIntervals } from "../types";
import type { SortMode } from "../App";
import { X, Save, Sun, Moon, Cloud, Sliders, Palette, Info } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { themes } from "../themes";

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) {
    const minutes = seconds / 60;
    return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} 分钟`;
  }
  const hours = seconds / 3600;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`;
}

interface SettingsPanelProps {
  settings: AppSettings;
  sortMode: SortMode;
  onClose: () => void;
  onSave: (next: AppSettings) => void;
  onSortModeChange: (mode: SortMode) => void;
}

type TabType = "general" | "appearance" | "about";

const GITHUB_URL = "https://github.com/Memhueet/pingo";

/** 关于页展示的技术栈与作者资源，位于 public/ 下 */
const ABOUT_CREDITS = [
  { src: "/react.svg", name: "React", type: "前端" },
  { src: "/tauri.svg", name: "Tauri", type: "跨平台框架" },
  { src: "/qodercn.png", name: "Qoder CN", type: "Agent" },
  { src: "/zcode.png", name: "Zcode", type: "Agent" },
  { src: "/moonway.png", name: "Moonway", type: "作者" },
];

/** GitHub 品牌标记（lucide 已移除品牌图标），路径取自 Simple Icons 官方 */
function GithubMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export function SettingsPanel({ settings, sortMode, onClose, onSave, onSortModeChange }: SettingsPanelProps) {
  const [draft, setDraft] = useState({ ...settings });
  const [activeTab, setActiveTab] = useState<TabType>("general");
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion(""));
  }, []);

  // 空字符串 = 跟随主题；色板需要合法色值，非法/为空时回落到主题色
  const theme = themes.find((t) => t.id === draft.themeId) ?? themes[0];
  const safeColor = (value: string, fallback: string) =>
    /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;

  // 无改动时保存按钮置灰，避免空写数据库
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  function setNumber(field: keyof AppSettings, value: string) {
    const num = value === "" ? 0 : Number(value);
    setDraft({ ...draft, [field]: num });
  }

  function setBackoffStep(index: number, value: string) {
    const num = value === "" ? 0 : Number(value);
    const next = [...draft.backoffIntervals];
    next[index] = Number.isFinite(num) && num > 0 ? num : 0;
    setDraft({ ...draft, backoffIntervals: next });
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
    { id: "about", label: "关于", icon: <Info size={14} /> },
  ];

  return (
    <div className="modalOverlay">
      <div className="modalPanel settingsModal">
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
        <div className={`settingsContent ${activeTab === "about" ? "settingsContentAbout" : ""}`}>
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
              <div className="settingsFieldGrid">
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
              <div className="settingsField">
                <div className="settingsFieldHeader">
                  <span>失败退避间隔</span>
                  <button
                    type="button"
                    className="resetBtn"
                    onClick={() =>
                      setDraft({ ...draft, backoffIntervals: [...defaultBackoffIntervals] })
                    }
                  >
                    恢复默认
                  </button>
                </div>
                <p className="fieldHint">
                  目标连续失败 6 次后，按以下档位逐级放慢探测频率，最后一档为封顶值
                </p>
                <div className="backoffGrid">
                  {draft.backoffIntervals.map((seconds, index) => (
                    <div key={index} className="backoffStep">
                      <span className="backoffStepLabel">
                        第 {index + 1} 档 · 失败 {6 + index} 次后
                      </span>
                      <span className="backoffStepInput">
                        <input
                          type="number"
                          min={1}
                          value={seconds}
                          aria-label={`第 ${index + 1} 档退避间隔（秒）`}
                          onChange={(event) => setBackoffStep(index, event.target.value)}
                        />
                        <span>秒</span>
                      </span>
                      {formatDuration(seconds) !== `${seconds} 秒` && (
                        <span className="fieldHint">≈ {formatDuration(seconds)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
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
                    value={safeColor(draft.aliasColor, theme.textSecondary)}
                    onChange={(event) => setDraft({ ...draft, aliasColor: event.target.value })}
                  />
                  <input
                    type="text"
                    value={draft.aliasColor}
                    placeholder="跟随主题"
                    onChange={(event) => setDraft({ ...draft, aliasColor: event.target.value.trim() })}
                    className="colorInput"
                  />
                  {draft.aliasColor !== "" && (
                    <button
                      type="button"
                      className="resetBtn"
                      onClick={() => setDraft({ ...draft, aliasColor: "" })}
                    >
                      跟随主题
                    </button>
                  )}
                </div>
              </label>
              <label>
                IP 地址颜色
                <div className="colorPickerRow">
                  <input
                    type="color"
                    value={safeColor(draft.ipv4Color, theme.text)}
                    onChange={(event) => setDraft({ ...draft, ipv4Color: event.target.value })}
                  />
                  <input
                    type="text"
                    value={draft.ipv4Color}
                    placeholder="跟随主题"
                    onChange={(event) => setDraft({ ...draft, ipv4Color: event.target.value.trim() })}
                    className="colorInput"
                  />
                  {draft.ipv4Color !== "" && (
                    <button
                      type="button"
                      className="resetBtn"
                      onClick={() => setDraft({ ...draft, ipv4Color: "" })}
                    >
                      跟随主题
                    </button>
                  )}
                </div>
              </label>
            </div>
          )}
          {activeTab === "about" && (
            <div className="settingsTabContent aboutTab">
              <p className="aboutIntro">
                Pingo 是基于 Tauri 构建的轻量级 IP 可达性与延迟监控跨平台应用，
                以 MIT 协议开源，欢迎大家贡献代码与反馈问题。
                <button
                  type="button"
                  className="aboutGithubLink"
                  onClick={() => openUrl(GITHUB_URL).catch(() => {})}
                >
                  <GithubMark size={14} />
                  github.com/Memhueet/pingo
                </button>
              </p>
              <div className="aboutCredits">
                {ABOUT_CREDITS.map((item) => (
                  <div key={item.name} className="aboutCredit">
                    <img className="aboutCreditIcon" src={item.src} alt={item.name} />
                    <span className="aboutCreditName">{item.name}</span>
                    <span className="aboutCreditType">{item.type}</span>
                  </div>
                ))}
              </div>
              <p className="aboutText">
                <strong>Pingo</strong> —— 轻量的 IP 可达性与延迟监控跨平台应用
                <span className="aboutTagline">
                  better than use monitor
                </span>
                版本: {appVersion || "—"}
              </p>
            </div>
          )}
        </div>
        <div className="panelActions">
          <button onClick={onClose}>取消</button>
          <button
            onClick={() => onSave(draft)}
            className="primaryBtn"
            disabled={!dirty}
          >
            <Save size={14} style={{ marginRight: 6 }} />
            保存
          </button>
        </div>
      </div>
    </div>
  );
}