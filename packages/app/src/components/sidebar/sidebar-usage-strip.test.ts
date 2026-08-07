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

import type { Agent, ProjectDescriptor } from "@/stores/session-store";
import {
  mergeProjectUsageTotals,
  type ProjectUsageTotals,
} from "@/stores/project-usage-ledger-store";
import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";
import {
  aggregateProjectUsage,
  formatCompactTokens,
  formatRunningTime,
  formatUsageLabel,
  liveRunningMs,
  sumWorkspaceUsage,
  totalTokens,
} from "./sidebar-usage-strip";

function agent(id: string, workspaceId: string, usage: Agent["cumulativeUsage"]): Agent {
  const archived = id.startsWith("archived");
  return {
    id,
    serverId: "srv",
    workspaceId,
    archivedAt: archived ? new Date() : null,
    // The daemon sets a placement's projectKey to the host-local project id.
    projectPlacement: archived ? { projectKey: "proj-1" } : null,
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

describe("aggregateProjectUsage", () => {
  const projectKey = "remote:github.com/acme/repo";

  function usage(
    input: { inputTokens?: number; runningMs?: number } = {},
  ): NonNullable<Agent["cumulativeUsage"]> {
    return {
      inputTokens: input.inputTokens ?? 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      runningMs: input.runningMs ?? 0,
    };
  }

  function buildSessions(agents: Agent[]): Array<{
    serverId: string;
    projects: Map<string, ProjectDescriptor>;
    agents: Map<string, Agent>;
  }> {
    return [
      {
        serverId: "srv",
        projects: new Map([["proj-1", { projectId: "proj-1", projectKey } as ProjectDescriptor]]),
        agents: new Map(agents.map((entry) => [entry.id, entry])),
      },
    ];
  }

  const project = {
    viewKey: projectKey,
    projectName: "repo",
    projectKind: "git",
    iconWorkingDir: "/repo",
    hosts: [{ serverId: "srv", projectId: "proj-1", iconWorkingDir: "/repo" }],
    workspaces: [{ workspaceKey: "srv:ws-1", serverId: "srv", workspaceId: "ws-1" }],
  } as unknown as SidebarProjectEntry;

  it("keeps archived agents of the project in the aggregate", () => {
    const sessions = buildSessions([
      agent("a", "ws-1", usage({ inputTokens: 100, runningMs: 60_000 })),
      agent("archived-1", "ws-archived-1", usage({ inputTokens: 900 })),
    ]);
    const result = aggregateProjectUsage(sessions, project);
    expect(result).toEqual({
      inputTokens: 1000,
      cachedInputTokens: 0,
      outputTokens: 0,
      runningMs: 60_000,
    });
  });

  it("excludes archived agents of a different project", () => {
    const sessions = buildSessions([
      agent("a", "ws-1", usage({ inputTokens: 100 })),
      {
        ...agent("archived-other", "ws-other", usage({ inputTokens: 500 })),
        projectPlacement: { projectKey: "proj-2" },
      } as Agent,
    ]);
    const result = aggregateProjectUsage(sessions, project);
    expect(result?.inputTokens).toBe(100);
  });
});

describe("mergeProjectUsageTotals", () => {
  const totals = (inputTokens: number, runningMs = 0): ProjectUsageTotals => ({
    inputTokens,
    cachedInputTokens: 0,
    outputTokens: 0,
    runningMs,
  });

  it("holds the stored high-water mark when the project drops to nothing", () => {
    expect(mergeProjectUsageTotals(totals(1000, 60_000), null)).toEqual(totals(1000, 60_000));
  });

  it("never decreases a field when the observed aggregate shrinks", () => {
    expect(mergeProjectUsageTotals(totals(1000, 60_000), totals(100, 90_000))).toEqual(
      totals(1000, 90_000),
    );
  });

  it("returns the observed aggregate when nothing is stored yet", () => {
    expect(mergeProjectUsageTotals(undefined, totals(100))).toEqual(totals(100));
    expect(mergeProjectUsageTotals(undefined, null)).toBeNull();
  });
});

describe("liveRunningMs", () => {
  const NOW = Date.parse("2026-05-15T00:00:10.000Z");
  const running = (overrides: Partial<Agent> = {}): Agent =>
    ({
      id: "a",
      serverId: "srv",
      status: "running",
      activeTurn: { turnId: "t", startedAt: new Date(NOW - 12_000) },
      ...overrides,
    }) as Agent;

  it("counts elapsed time for a running agent since its turn started", () => {
    expect(liveRunningMs(running(), NOW)).toBe(12_000);
  });

  it("stays zero for idle agents even when a past start exists", () => {
    expect(liveRunningMs(running({ status: "idle" }), NOW)).toBe(0);
  });

  it("returns zero when a running agent has no active turn start", () => {
    expect(liveRunningMs(running({ activeTurn: { turnId: "t", startedAt: null } }), NOW)).toBe(0);
  });

  it("clamps a future start time to zero", () => {
    expect(
      liveRunningMs(
        running({ activeTurn: { turnId: "t", startedAt: new Date(NOW + 5_000) } }),
        NOW,
      ),
    ).toBe(0);
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
