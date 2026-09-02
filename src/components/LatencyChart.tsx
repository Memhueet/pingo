import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { PingSample } from "../types";

export function LatencyChart({
  samples,
  pingTimeoutMs,
}: {
  samples: PingSample[];
  pingTimeoutMs: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
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
      return;
    }

    const timestamps = samples.map((sample) => new Date(sample.sentAt).getTime() / 1000);
    const successValues: (number | null)[] = samples.map((sample) =>
      sample.status === "success" ? (sample.latencyMs ?? 0) : null,
    );
    const timeoutValues: (number | null)[] = samples.map((sample) =>
      sample.status === "timeout" ? pingTimeoutMs : null,
    );

    const data: uPlot.AlignedData = [timestamps, successValues, timeoutValues];

    if (!chartRef.current) {
      const chart = new uPlot(
        {
          width: chartSize.width,
          height: chartSize.height,
          scales: { x: { time: true } },
          axes: [{}, { label: "ms" }],
          series: [
            {},
            {
              label: "成功 (ms)",
              stroke: "#2563eb",
              fill: "#2563eb",
              paths: uPlot.paths.bars!({
                radius: 2,
              }),
              points: { show: false },
            },
            {
              label: "超时 (ms)",
              stroke: "#dc2626",
              fill: "#dc2626",
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
  }, [samples, pingTimeoutMs, chartSize]);

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
