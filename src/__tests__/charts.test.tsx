import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DetailPanel } from "../components/DetailPanel";
import type { TargetStatus } from "../types";

describe("DetailPanel", () => {
  it("shows statistics for selected target", () => {
    const status: TargetStatus = {
      target: {
        id: "target-1",
        ipv4: "192.168.1.1",
        alias: "Router",
        enabled: true,
        createdAt: "2026-06-18T00:00:00Z",
        updatedAt: "2026-06-18T00:00:00Z",
      },
      latestSample: null,
      consecutiveTimeouts: 1,
      alerting: false,
      samples: [
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
    };

    render(<DetailPanel status={status} pingTimeoutSecs={5} />);

    expect(screen.getByText("Router")).toBeTruthy();
    expect(screen.getByText("Average 10.0 ms")).toBeTruthy();
    expect(screen.getByText("Timeouts 1")).toBeTruthy();
  });
});
