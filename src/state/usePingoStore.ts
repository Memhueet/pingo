 import type { AppSettings, PingSample, Target, TargetStatus } from "../types";

/** 旧版内置的深色文字默认值；它们在暗色主题下不可读，加载时归一化为"跟随主题" */
const LEGACY_ALIAS_COLOR = "#1f2933";
const LEGACY_IPV4_COLOR = "#6b7280";

/** 琥珀棕主题已替换为鲜草绿，旧 id 迁移到新主题 */
const RENAMED_THEME_IDS: Record<string, string> = {
  "amber-brown": "grass-green",
};

/** 空字符串表示别名/IP 文字颜色跟随当前主题 */
export function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    aliasColor: settings.aliasColor === LEGACY_ALIAS_COLOR ? "" : settings.aliasColor,
    ipv4Color: settings.ipv4Color === LEGACY_IPV4_COLOR ? "" : settings.ipv4Color,
    themeId: RENAMED_THEME_IDS[settings.themeId] ?? settings.themeId,
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
