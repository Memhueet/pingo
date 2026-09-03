 import type { AppSettings, PingSample, Target, TargetStatus } from "../types";

/** 旧版内置的深色文字默认值；它们在暗色主题下不可读，加载时归一化为"跟随主题" */
const LEGACY_ALIAS_COLOR = "#1f2933";
const LEGACY_IPV4_COLOR = "#6b7280";

/** 琥珀棕主题已替换为鲜草绿，旧 id 迁移到新主题 */
const RENAMED_THEME_IDS: Record<string, string> = {
  "amber-brown": "grass-green",
};

const APPEARANCE_STORAGE_KEY = "pingo.appearance";

interface AppearanceSettings {
  themeId: string;
  aliasColor: string;
  ipv4Color: string;
}

/** 外观配置属于应用本身而非数据文件；开始页在打开数据文件前也要能用上次的主题 */
export function loadAppearance(): Partial<AppearanceSettings> {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<AppearanceSettings>) : {};
  } catch {
    return {};
  }
}

/** 保存设置时同步外观到应用级存储 */
export function saveAppearance(settings: AppSettings): void {
  try {
    const appearance: AppearanceSettings = {
      themeId: settings.themeId,
      aliasColor: settings.aliasColor,
      ipv4Color: settings.ipv4Color,
    };
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // WebView 存储不可用时忽略，外观退化为跟随数据文件
  }
}

/** 空字符串表示别名/IP 文字颜色跟随当前主题 */
export function normalizeSettings(settings: AppSettings): AppSettings {
  const appearance = loadAppearance();
  return {
    ...settings,
    aliasColor: settings.aliasColor === LEGACY_ALIAS_COLOR ? "" : settings.aliasColor,
    ipv4Color: settings.ipv4Color === LEGACY_IPV4_COLOR ? "" : settings.ipv4Color,
    themeId: RENAMED_THEME_IDS[settings.themeId] ?? settings.themeId,
    // 数据文件里滞留的外观值让位于本机保存的应用级配置
    ...(appearance.themeId !== undefined
      ? { themeId: RENAMED_THEME_IDS[appearance.themeId] ?? appearance.themeId }
      : {}),
    ...(appearance.aliasColor !== undefined ? { aliasColor: appearance.aliasColor } : {}),
    ...(appearance.ipv4Color !== undefined ? { ipv4Color: appearance.ipv4Color } : {}),
  };
}

export function createTargetStatus(target: Target): TargetStatus {
  return {
    target,
    latestSample: null,
    consecutiveTimeouts: 0,
    alerting: false,
    samples: [],
  };
}

export function applyPingSample(
  status: TargetStatus,
  sample: PingSample,
  alerting: boolean,
): TargetStatus {
  const consecutiveTimeouts =
    sample.status === "timeout" || sample.status === "error"
      ? status.consecutiveTimeouts + 1
      : 0;

  return {
    ...status,
    latestSample: sample,
    samples: [...status.samples, sample],
    consecutiveTimeouts,
    alerting,
  };
}
