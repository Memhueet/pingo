import { describe, expect, it } from "vitest";
import {
  clampChartWindowSeconds,
  secondsToValueUnit,
  valueUnitToSeconds,
} from "../utils/duration";

describe("clampChartWindowSeconds", () => {
  it("钳制到 1 分钟 – 30 天", () => {
    expect(clampChartWindowSeconds(30)).toBe(60);
    expect(clampChartWindowSeconds(999_999_999)).toBe(2_592_000);
    expect(clampChartWindowSeconds(5400)).toBe(5400);
  });

  it("非法输入回落默认 3600", () => {
    expect(clampChartWindowSeconds(Number.NaN)).toBe(3600);
    expect(clampChartWindowSeconds(Number.POSITIVE_INFINITY)).toBe(3600);
  });
});

describe("secondsToValueUnit / valueUnitToSeconds", () => {
  it("整小时、整天优先大单位", () => {
    expect(secondsToValueUnit(3600)).toEqual({ value: 1, unit: "hour" });
    expect(secondsToValueUnit(172800)).toEqual({ value: 2, unit: "day" });
  });

  it("非整点值落到分钟", () => {
    expect(secondsToValueUnit(5400)).toEqual({ value: 90, unit: "minute" });
    expect(secondsToValueUnit(90000)).toEqual({ value: 25, unit: "hour" });
  });

  it("值×单位换回秒并钳制", () => {
    expect(valueUnitToSeconds({ value: 90, unit: "minute" })).toBe(5400);
    expect(valueUnitToSeconds({ value: 25, unit: "hour" })).toBe(90000);
    expect(valueUnitToSeconds({ value: 0, unit: "hour" })).toBe(60);
  });
});
