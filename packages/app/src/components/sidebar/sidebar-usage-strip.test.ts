/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";

const theme = vi.hoisted(() => ({
  colors: {
    foreground: "#111",
    foregroundMuted: "#666",
    statusMutedWarning: "#755f45",
    statusMutedMerged: "#6e519d",
    statusMutedSuccess: "#496d50",
  },
  spacing: { 1: 4, 2: 8 },
  fontSize: { xs: 12 },
  fontWeight: { medium: "500" },
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
  ArrowDownLeft: () => null,
  ArrowUpRight: () => null,
  Clock: () => null,
  Coins: () => null,
  Database: () => null,
}));

import type { Agent } from "@/stores/session-store";
import {
  formatCompactTokens,
  formatRunningTime,
  formatUsageLabel,
  sumWorkspaceUsage,
  totalTokens,
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
  it("sums token breakdown and running time across agents per workspace", () => {
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
    expect(result.get("srv:ws-1")).toEqual({
      inputTokens: 1099,
      cachedInputTokens: 50,
      outputTokens: 25,
      runningMs: 60_000,
    });
    expect(result.get("srv:ws-2")).toEqual({
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 5,
      runningMs: 30_000,
    });
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

  it("sums the aggregate into a total", () => {
    expect(
      totalTokens({ inputTokens: 100, cachedInputTokens: 50, outputTokens: 25, runningMs: 0 }),
    ).toBe(175);
  });

  it("builds a breakdown label, omitting zero parts", () => {
    expect(
      formatUsageLabel({
        inputTokens: 150_000,
        cachedInputTokens: 73_000,
        outputTokens: 25_000,
        runningMs: 60 * 60 * 1000 + 40 * 60 * 1000,
      }),
    ).toBe("248K tokens total · 150K in · 25K out · 73K cached · 1h 40m");
    expect(
      formatUsageLabel({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, runningMs: 5_000 }),
    ).toBe("5s");
    expect(
      formatUsageLabel({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, runningMs: 0 }),
    ).toBeNull();
  });
});
