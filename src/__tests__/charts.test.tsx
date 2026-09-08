import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DetailPanel } from "../components/DetailPanel";
import { buildBuffer, isPureAppend } from "../components/LatencyChart";
import { getThemeById } from "../themes";
import { applySampleToStats, emptyFullStats } from "../utils/stats";
import type { PingSample, TargetStatus } from "../types";

const loadAllSamplesMock = vi.fn();
vi.mock("../api/tauri", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadAllSamples: (...args: unknown[]) => loadAllSamplesMock(...args),
}));

function statusWithSamples(base: Omit<TargetStatus, "stats" | "samples">, samples: PingSample[]): TargetStatus {
  return {
    ...base,
    samples,
    stats: samples.reduce((acc, s) => applySampleToStats(acc, s), emptyFullStats()),
  };
}

describe("DetailPanel", () => {
  it("shows statistics for selected target", () => {
    const status = statusWithSamples(
      {
        target: {
          id: "target-1",
          address: "192.168.1.1",
          alias: "Router",
          enabled: true,
          createdAt: "2026-06-18T00:00:00Z",
          updatedAt: "2026-06-18T00:00:00Z",
        },
        latestSample: null,
        consecutiveTimeouts: 1,
        alerting: false,
      },
      [
        {
          id: "sample-1",
          targetId: "target-1",
          sentAt: "2026-06-18T00:00:00Z",
          status: "success",
          latencyMs: 10,
          errorKind: null,
        },
        {
          id: "sample-2",
          targetId: "target-1",
          sentAt: "2026-06-18T00:00:05Z",
          status: "timeout",
          latencyMs: null,
          errorKind: "timeout",
        },
      ],
    );

    render(
      <DetailPanel
        status={status}
        pingTimeoutSecs={5}
        theme={getThemeById("pure-white")}
        ignoreSingleTimeout={false}
      />,
    );

    expect(screen.getByText("Router")).toBeTruthy();
    expect(screen.getByText("Average 10.0 ms")).toBeTruthy();
    expect(screen.getByText("Timeouts 1")).toBeTruthy();
  });

  it("hides isolated timeout stats when ignoreSingleTimeout is on", () => {
    const status = statusWithSamples(
      {
        target: {
          id: "target-1",
          address: "192.168.1.1",
          alias: "Router",
          enabled: true,
          createdAt: "2026-06-18T00:00:00Z",
          updatedAt: "2026-06-18T00:00:00Z",
        },
        latestSample: null,
        consecutiveTimeouts: 1,
        alerting: false,
      },
      [
        {
          id: "sample-1",
          targetId: "target-1",
          sentAt: "2026-06-18T00:00:00Z",
          status: "success",
          latencyMs: 10,
          errorKind: null,
        },
        {
          id: "sample-2",
          targetId: "target-1",
          sentAt: "2026-06-18T00:00:05Z",
          status: "timeout",
          latencyMs: null,
          errorKind: "timeout",
        },
      ],
    );

    render(
      <DetailPanel
        status={status}
        pingTimeoutSecs={5}
        theme={getThemeById("pure-white")}
        ignoreSingleTimeout={true}
      />,
    );

    // 孤立的超时样本被过滤：不计入超时数，也不影响平均/最大延迟
    expect(screen.getByText("Timeouts 0")).toBeTruthy();
    expect(screen.getByText("Average 10.0 ms")).toBeTruthy();
  });

  it("查看全部：进入冻结态显示快照时间与动作，返回实时后消失", async () => {
    loadAllSamplesMock.mockResolvedValue([
      {
        id: "hist-1",
        targetId: "target-1",
        sentAt: "2026-09-01T00:00:00Z",
        status: "success",
        latencyMs: 8,
        errorKind: null,
      },
    ]);
    const status = statusWithSamples(
      {
        target: { id: "target-1", address: "192.168.1.1", alias: "Router", enabled: true, createdAt: "2026-06-18T00:00:00Z", updatedAt: "2026-06-18T00:00:00Z" },
        latestSample: null,
        consecutiveTimeouts: 0,
        alerting: false,
      },
      [],
    );
    render(
      <DetailPanel status={status} pingTimeoutSecs={5} theme={getThemeById("pure-white")} ignoreSingleTimeout={false} />,
    );

    fireEvent.click(screen.getByText("查看全部"));
    expect(await screen.findByText(/快照于/)).toBeTruthy();
    expect(loadAllSamplesMock).toHaveBeenCalledWith("target-1");

    fireEvent.click(screen.getByText("返回实时"));
    expect(screen.queryByText(/快照于/)).toBeNull();
    expect(screen.getByText("查看全部")).toBeTruthy();
  });
});

describe("LatencyChart 缓冲", () => {
  const T0 = Date.parse("2026-09-08T00:00:00Z");
  function sample(id: string, index: number, status: PingSample["status"] = "success"): PingSample {
    return {
      id,
      targetId: "t1",
      sentAt: new Date(T0 + index * 5000).toISOString(),
      status,
      latencyMs: status === "success" ? 10 : null,
      errorKind: null,
    };
  }

  it("buildBuffer 映射成功/超时/错误三列", () => {
    const buffer = buildBuffer(
      "t1",
      [sample("a", 0), sample("b", 1, "timeout"), sample("c", 2, "error")],
      5000,
    );
    expect(buffer.ids).toEqual(["a", "b", "c"]);
    expect(buffer.success).toEqual([10, null, null]);
    expect(buffer.timeout).toEqual([null, 5000, null]);
    expect(buffer.xs[1] - buffer.xs[0]).toBe(5);
  });

  it("isPureAppend：纯追加为真，头删/目标切换/超时参数变化/等长为假", () => {
    const buffer = buildBuffer("t1", [sample("a", 0), sample("b", 1)], 5000);
    expect(isPureAppend(buffer, "t1", 5000, [sample("a", 0), sample("b", 1), sample("c", 2)])).toBe(true);
    expect(isPureAppend(buffer, "t1", 5000, [sample("b", 1), sample("c", 2), sample("d", 3)])).toBe(false);
    expect(isPureAppend(buffer, "t2", 5000, [sample("a", 0), sample("b", 1), sample("c", 2)])).toBe(false);
    expect(isPureAppend(buffer, "t1", 9000, [sample("a", 0), sample("b", 1), sample("c", 2)])).toBe(false);
    expect(isPureAppend(buffer, "t1", 5000, [sample("a", 0), sample("x", 1)])).toBe(false);
  });
});
