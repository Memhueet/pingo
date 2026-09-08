export type DurationUnit = "minute" | "hour" | "day";

const UNIT_SECONDS: Record<DurationUnit, number> = {
  minute: 60,
  hour: 3600,
  day: 86400,
};

/** 图表实时窗口的合法范围（秒）：1 分钟 – 30 天 */
export const CHART_WINDOW_MIN_SECONDS = 60;
export const CHART_WINDOW_MAX_SECONDS = 2_592_000;

export function clampChartWindowSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 3600;
  return Math.min(
    CHART_WINDOW_MAX_SECONDS,
    Math.max(CHART_WINDOW_MIN_SECONDS, Math.round(seconds)),
  );
}

/** 展示拆值：整天/整小时优先取大单位，其余落分钟（值可为小数） */
export function secondsToValueUnit(seconds: number): {
  value: number;
  unit: DurationUnit;
} {
  if (seconds % 86400 === 0) return { value: seconds / 86400, unit: "day" };
  if (seconds % 3600 === 0) return { value: seconds / 3600, unit: "hour" };
  return { value: seconds / 60, unit: "minute" };
}

export function valueUnitToSeconds(input: {
  value: number;
  unit: DurationUnit;
}): number {
  return clampChartWindowSeconds(input.value * UNIT_SECONDS[input.unit]);
}
