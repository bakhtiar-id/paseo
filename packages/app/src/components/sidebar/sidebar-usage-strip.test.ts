/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";

const theme = vi.hoisted(() => ({
  colors: { foregroundMuted: "#666" },
  spacing: { 1: 4, 2: 8 },
  fontSize: { xs: 12 },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function"
        ? (factory as (value: Record<string, unknown>) => unknown)(theme)
        : factory,
  },
  withUnistyles: (component: unknown) => component,
}));

vi.mock("lucide-react-native", () => ({
  Clock: () => null,
  Coins: () => null,
}));

import type { Agent } from "@/stores/session-store";
import {
  formatCompactTokens,
  formatRunningTime,
  formatUsageLabel,
  sumWorkspaceUsage,
} from "./sidebar-usage-strip";

function agent(id: string, workspaceId: string, usage: Agent["cumulativeUsage"]): Agent {
  return {
    id,
    serverId: "srv",
    workspaceId,
    cumulativeUsage: usage,
  } as Agent;
}

describe("sidebar-usage-strip aggregation", () => {
  it("sums tokens and running time across agents per workspace", () => {
    const sessions = [
      {
        agents: new Map([
          [
            "a",
            agent("a", "ws-1", {
              inputTokens: 100,
              cachedInputTokens: 50,
              outputTokens: 25,
              costUsd: 0,
              runningMs: 60_000,
            }),
          ],
          [
            "b",
            agent("b", "ws-2", {
              inputTokens: 10,
              cachedInputTokens: 0,
              outputTokens: 5,
              costUsd: 0,
              runningMs: 30_000,
            }),
          ],
          [
            "archived",
            agent("archived", "ws-1", {
              inputTokens: 999,
              cachedInputTokens: 0,
              outputTokens: 0,
              costUsd: 0,
              runningMs: 0,
            }),
          ],
        ]),
      },
    ];
    sessions[0].agents.get("archived")!.archivedAt = new Date();
    const result = sumWorkspaceUsage(sessions);
    expect(result.get("srv:ws-1")).toEqual({ tokens: 175, runningMs: 60_000 });
    expect(result.get("srv:ws-2")).toEqual({ tokens: 15, runningMs: 30_000 });
    expect(result.get("srv:archived")).toBeUndefined();
  });
});

describe("formatting", () => {
  it("formats compact tokens", () => {
    expect(formatCompactTokens(84)).toBe("84");
    expect(formatCompactTokens(248_000)).toBe("248K");
    expect(formatCompactTokens(1_240_000)).toBe("1.2M");
  });

  it("formats running time", () => {
    expect(formatRunningTime(12_000)).toBe("12s");
    expect(formatRunningTime(60_000)).toBe("1m");
    expect(formatRunningTime(60 * 60 * 1000 + 5 * 60 * 1000)).toBe("1h 5m");
  });

  it("builds a combined label, omitting zero parts", () => {
    expect(formatUsageLabel({ tokens: 248_000, runningMs: 60 * 60 * 1000 + 40 * 60 * 1000 })).toBe(
      "248K tokens · 1h 40m",
    );
    expect(formatUsageLabel({ tokens: 0, runningMs: 5_000 })).toBe("5s");
    expect(formatUsageLabel({ tokens: 0, runningMs: 0 })).toBeNull();
  });
});
