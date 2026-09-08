import type { AppSettings, FullStats, PingSample, Target, TargetStatus } from "../types";
import { applySampleToStats, emptyFullStats } from "../utils/stats";

/** 旧版内置的深色文字默认值；它们在暗色主题下不可读，加载时归一化为"跟随主题" */
const LEGACY_ALIAS_COLOR = "#1f2933";
const LEGACY_ADDRESS_COLOR = "#6b7280";

/** 琥珀棕主题已替换为鲜草绿，旧 id 迁移到新主题 */
const RENAMED_THEME_IDS: Record<string, string> = {
  "amber-brown": "grass-green",
};

const APPEARANCE_STORAGE_KEY = "pingo.appearance";

interface AppearanceSettings {
  themeId: string;
  aliasColor: string;
  addressColor: string;
  ignoreSingleTimeout: boolean;
}

/**
 * 外观配置属于应用本身而非数据文件；开始页在打开数据文件前也要能用上次的主题。
 * 旧版外观对象里 IP 颜色字段名为 ipv4Color，读取时回退到新字段
 */
export function loadAppearance(): Partial<AppearanceSettings> {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<AppearanceSettings> & { ipv4Color?: string };
    if (parsed.addressColor === undefined && parsed.ipv4Color !== undefined) {
      parsed.addressColor = parsed.ipv4Color;
    }
    delete parsed.ipv4Color;
    return parsed;
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
      addressColor: settings.addressColor,
      ignoreSingleTimeout: settings.ignoreSingleTimeout,
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
    addressColor: settings.addressColor === LEGACY_ADDRESS_COLOR ? "" : settings.addressColor,
    themeId: RENAMED_THEME_IDS[settings.themeId] ?? settings.themeId,
    // 数据文件里滞留的外观值让位于本机保存的应用级配置
    ...(appearance.themeId !== undefined
      ? { themeId: RENAMED_THEME_IDS[appearance.themeId] ?? appearance.themeId }
      : {}),
    ...(appearance.aliasColor !== undefined ? { aliasColor: appearance.aliasColor } : {}),
    ...(appearance.addressColor !== undefined ? { addressColor: appearance.addressColor } : {}),
    // 本字段无数据文件旧值，应用级配置缺省即关闭
    ignoreSingleTimeout: appearance.ignoreSingleTimeout ?? false,
  };
}

/** 实时窗口宽容度（秒）：跨度达到 W+H 才一次性裁回 W，避免逐条 shift */
export const CHART_WINDOW_HYSTERESIS_SECONDS = 600;

/** 跨度超过 W+H 时头删至跨度 ≤ W；其余情况原数组原样返回（零拷贝） */
export function trimSamplesWindow(
  samples: PingSample[],
  windowSeconds: number,
): PingSample[] {
  if (samples.length === 0) return samples;
  const windowMs = windowSeconds * 1000;
  const hysteresisMs = CHART_WINDOW_HYSTERESIS_SECONDS * 1000;
  const lastMs = Date.parse(samples[samples.length - 1].sentAt);
  const firstMs = Date.parse(samples[0].sentAt);
  if (lastMs - firstMs <= windowMs + hysteresisMs) return samples;
  const trimmed = [...samples];
  while (
    trimmed.length > 1 &&
    Date.parse(trimmed[trimmed.length - 1].sentAt) -
      Date.parse(trimmed[0].sentAt) >
      windowMs
  ) {
    trimmed.shift();
  }
  return trimmed;
}

export function createTargetStatus(target: Target, stats?: FullStats): TargetStatus {
  return {
    target,
    latestSample: null,
    consecutiveTimeouts: 0,
    alerting: false,
    samples: [],
    stats: stats ?? emptyFullStats(),
  };
}

export function applyPingSample(
  status: TargetStatus,
  sample: PingSample,
  alerting: boolean,
  windowSeconds: number,
): TargetStatus {
  const consecutiveTimeouts =
    sample.status === "timeout" || sample.status === "error"
      ? status.consecutiveTimeouts + 1
      : 0;

  return {
    ...status,
    latestSample: sample,
    samples: trimSamplesWindow([...status.samples, sample], windowSeconds),
    consecutiveTimeouts,
    alerting,
    stats: applySampleToStats(status.stats, sample),
  };
}
