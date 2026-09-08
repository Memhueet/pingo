import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { PingSample } from "../types";
import type { Theme } from "../themes";

/** 图表持有的数据缓冲：与 uPlot 三列数组同引用，纯追加时原地 push */
export interface ChartBuffer {
  targetId: string;
  pingTimeoutMs: number;
  xs: number[];
  success: (number | null)[];
  timeout: (number | null)[];
  ids: string[];
}

function pushSample(buffer: ChartBuffer, sample: PingSample, pingTimeoutMs: number) {
  buffer.xs.push(new Date(sample.sentAt).getTime() / 1000);
  buffer.success.push(sample.status === "success" ? (sample.latencyMs ?? 0) : null);
  buffer.timeout.push(sample.status === "timeout" ? pingTimeoutMs : null);
  buffer.ids.push(sample.id);
}

export function buildBuffer(
  targetId: string,
  samples: PingSample[],
  pingTimeoutMs: number,
): ChartBuffer {
  const buffer: ChartBuffer = {
    targetId,
    pingTimeoutMs,
    xs: [],
    success: [],
    timeout: [],
    ids: [],
  };
  for (const sample of samples) pushSample(buffer, sample, pingTimeoutMs);
  return buffer;
}

/** 纯追加判定：目标/超时参数未变，且新数组是持有数组的纯超集（首、持有尾 id 同下标相等且长度严格增长） */
export function isPureAppend(
  buffer: ChartBuffer,
  targetId: string,
  pingTimeoutMs: number,
  samples: PingSample[],
): boolean {
  return (
    buffer.targetId === targetId &&
    buffer.pingTimeoutMs === pingTimeoutMs &&
    samples.length > buffer.ids.length &&
    samples[0]?.id === buffer.ids[0] &&
    samples[buffer.ids.length - 1]?.id === buffer.ids[buffer.ids.length - 1]
  );
}

export function LatencyChart({
  targetId,
  samples,
  pingTimeoutMs,
  theme,
}: {
  targetId: string;
  samples: PingSample[];
  pingTimeoutMs: number;
  theme: Theme;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  const bufferRef = useRef<ChartBuffer | null>(null);
  const [chartSize, setChartSize] = useState({ width: 720, height: 300 });

  useEffect(() => {
    if (!hostRef.current) return;
    const parent = hostRef.current.parentElement;
    if (!parent) return;

    const updateSize = () => {
      const availableHeight = parent.clientHeight || 300;
      setChartSize({
        width: parent.clientWidth || 720,
        height: Math.max(100, availableHeight),
      });
    };
    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(parent);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!hostRef.current) return;
    if (samples.length === 0) {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      bufferRef.current = null;
      return;
    }

    let buffer = bufferRef.current;
    if (buffer && isPureAppend(buffer, targetId, pingTimeoutMs, samples)) {
      for (const sample of samples.slice(buffer.ids.length)) {
        pushSample(buffer, sample, pingTimeoutMs);
      }
    } else {
      // 批量裁剪 / 目标切换 / 窗口变更 / 合并加载：整体重建
      buffer = buildBuffer(targetId, samples, pingTimeoutMs);
      bufferRef.current = buffer;
    }
    const data: uPlot.AlignedData = [buffer.xs, buffer.success, buffer.timeout];

    if (!chartRef.current) {
      const axisColor = theme.chartAxis;
      const gridColor = theme.chartGrid;
      const chart = new uPlot(
        {
          width: chartSize.width,
          height: chartSize.height,
          scales: { x: { time: true } },
          axes: [
            { stroke: axisColor, grid: { stroke: gridColor }, ticks: { stroke: gridColor } },
            {
              label: "ms",
              stroke: axisColor,
              grid: { stroke: gridColor },
              ticks: { stroke: gridColor },
            },
          ],
          series: [
            {},
            {
              label: "成功 (ms)",
              stroke: theme.chartSuccess,
              fill: theme.chartSuccess,
              paths: uPlot.paths.bars!({
                radius: 2,
              }),
              points: { show: false },
            },
            {
              label: "超时 (ms)",
              stroke: theme.chartTimeout,
              fill: theme.chartTimeout,
              paths: uPlot.paths.bars!({
                radius: 2,
              }),
              points: { show: false },
            },
          ],
          cursor: { drag: { x: true, y: false } },
          legend: {
            show: true,
            live: true,
          },
        },
        data,
        hostRef.current,
      );

      chartRef.current = chart;
    } else {
      chartRef.current.setData(data);
      chartRef.current.setSize({ width: chartSize.width, height: chartSize.height });
    }
  }, [samples, pingTimeoutMs, targetId, chartSize, theme]);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);

  return (
    <div className="latencyChartWrapper">
      <div className="latencyChart" ref={hostRef} />
    </div>
  );
}
