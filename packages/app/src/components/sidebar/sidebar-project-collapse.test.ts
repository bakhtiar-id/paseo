import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import {
  collectWorkspaceAgentDoneKeys,
  resolveEffectiveCollapsedProjectKeys,
  resolveLiveProjectKeys,
  shouldSweepWorkspace,
  DONE_SWEEP_IDLE_MS,
  type SidebarProjectRef,
} from "./sidebar-project-collapse";

const NOW = new Date("2026-07-30T00:00:00.000Z");

function agent(overrides: Partial<Agent>): Agent {
  return {
    id: "agent-1",
    serverId: "srv",
    provider: "claude",
    status: "running",
    title: "Agent",
    cwd: "/repo/main",
    workspaceId: "ws-1",
    model: null,
    currentModeId: null,
    availableModes: [],
    thinkingOptionId: undefined,
    requiresAttention: false,
    attentionReason: null,
    pendingPermissions: [],
    archivedAt: null,
    lastActivityAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Agent;
}

const PROJECTS: SidebarProjectRef[] = [
  {
    viewKey: "project-1",
    workspaces: [{ serverId: "srv", workspaceId: "ws-1" }],
  },
  {
    viewKey: "project-2",
    workspaces: [{ serverId: "srv", workspaceId: "ws-2" }],
  },
];

describe("resolveLiveProjectKeys", () => {
  it("marks projects with running agents as live", () => {
    const sessions = {
      srv: {
        agents: new Map([
          ["a1", agent({ id: "a1", status: "running", workspaceId: "ws-1" })],
          ["a2", agent({ id: "a2", status: "done" as never, workspaceId: "ws-2" })],
        ]),
      },
    } as never;

    expect([...resolveLiveProjectKeys(sessions, PROJECTS, new Set())].sort()).toEqual([
      "project-1",
    ]);
  });

  it("treats waiting-for-permission agents as live", () => {
    const sessions = {
      srv: {
        agents: new Map([
          ["a1", agent({ status: "idle" as never, pendingPermissions: [{}] as never })],
        ]),
      },
    } as never;

    expect([...resolveLiveProjectKeys(sessions, PROJECTS, new Set())]).toEqual(["project-1"]);
  });

  it("ignores archived agents", () => {
    const sessions = {
      srv: {
        agents: new Map([["a1", agent({ archivedAt: NOW })]]),
      },
    } as never;

    expect(resolveLiveProjectKeys(sessions, PROJECTS, new Set()).size).toBe(0);
  });

  it("ignores manually completed agents", () => {
    const sessions = {
      srv: {
        agents: new Map([["a1", agent({ id: "a1", status: "running" })]]),
      },
    } as never;

    expect(resolveLiveProjectKeys(sessions, PROJECTS, new Set(["srv:a1"])).size).toBe(0);
  });
});

describe("resolveEffectiveCollapsedProjectKeys", () => {
  it("collapses idle projects that were never expanded", () => {
    const collapsed = resolveEffectiveCollapsedProjectKeys({
      collapsedProjectKeys: new Set(),
      expandedProjectKeys: new Set(),
      liveProjectKeys: new Set(),
      projects: PROJECTS,
    });

    expect([...collapsed].sort()).toEqual(["project-1", "project-2"]);
  });

  it("keeps live projects expanded even if not touched", () => {
    const collapsed = resolveEffectiveCollapsedProjectKeys({
      collapsedProjectKeys: new Set(),
      expandedProjectKeys: new Set(),
      liveProjectKeys: new Set(["project-1"]),
      projects: PROJECTS,
    });

    expect([...collapsed]).toEqual(["project-2"]);
  });

  it("honors explicit expansion of an idle project", () => {
    const collapsed = resolveEffectiveCollapsedProjectKeys({
      collapsedProjectKeys: new Set(),
      expandedProjectKeys: new Set(["project-2"]),
      liveProjectKeys: new Set(["project-1"]),
      projects: PROJECTS,
    });

    expect([...collapsed]).toEqual([]);
  });

  it("keeps user-collapsed projects collapsed even when live", () => {
    const collapsed = resolveEffectiveCollapsedProjectKeys({
      collapsedProjectKeys: new Set(["project-1"]),
      expandedProjectKeys: new Set(),
      liveProjectKeys: new Set(["project-1"]),
      projects: PROJECTS,
    });

    expect([...collapsed].sort()).toEqual(["project-1", "project-2"]);
  });
});

describe("shouldSweepWorkspace", () => {
  const NOW_MS = NOW.getTime() + DONE_SWEEP_IDLE_MS;

  it("never sweeps unhydrated workspaces", () => {
    expect(
      shouldSweepWorkspace({
        hydrated: false,
        agents: [],
        manualDoneKeys: new Set(),
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  it("keeps hydrated workspaces with no agents visible", () => {
    expect(
      shouldSweepWorkspace({
        hydrated: true,
        agents: [],
        manualDoneKeys: new Set(),
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  it("never sweeps while an agent is not done", () => {
    const agents = [agent({ status: "running" }), agent({ status: "done" as never })];
    expect(
      shouldSweepWorkspace({ hydrated: true, agents, manualDoneKeys: new Set(), nowMs: NOW_MS }),
    ).toBe(false);
  });

  it("keeps recently finished agents visible for a day", () => {
    const agents = [agent({ status: "done" as never, lastActivityAt: NOW })];
    expect(
      shouldSweepWorkspace({
        hydrated: true,
        agents,
        manualDoneKeys: new Set(),
        nowMs: NOW.getTime(),
      }),
    ).toBe(false);
  });

  it("sweeps once done agents have been quiet for a day", () => {
    const agents = [
      agent({ status: "done" as never, lastActivityAt: new Date(NOW_MS - DONE_SWEEP_IDLE_MS - 1) }),
    ];
    expect(
      shouldSweepWorkspace({ hydrated: true, agents, manualDoneKeys: new Set(), nowMs: NOW_MS }),
    ).toBe(true);
  });

  it("sweeps immediately when agents are manually marked done", () => {
    const recent = agent({ status: "done" as never, lastActivityAt: NOW });
    expect(
      shouldSweepWorkspace({
        hydrated: true,
        agents: [recent],
        manualDoneKeys: new Set([`${recent.serverId}:${recent.id}`]),
        nowMs: NOW_MS,
      }),
    ).toBe(true);
  });

  it("ignores archived agents", () => {
    const agents = [agent({ archivedAt: NOW })];
    expect(
      shouldSweepWorkspace({ hydrated: true, agents, manualDoneKeys: new Set(), nowMs: NOW_MS }),
    ).toBe(true);
  });
});

describe("collectWorkspaceAgentDoneKeys", () => {
  it("collects keys for agents on the given workspaces", () => {
    const sessions = {
      srv: {
        agents: new Map([
          ["a1", agent({ id: "a1", workspaceId: "ws-1" })],
          ["a2", agent({ id: "a2", workspaceId: "ws-1" })],
          ["a3", agent({ id: "a3", workspaceId: "ws-2" })],
        ]),
      },
    } as never;

    expect(
      collectWorkspaceAgentDoneKeys(sessions, [{ serverId: "srv", workspaceId: "ws-1" }]).sort(),
    ).toEqual(["srv:a1", "srv:a2"]);
  });

  it("skips archived agents and missing sessions", () => {
    const sessions = {
      srv: {
        agents: new Map([
          ["a1", agent({ id: "a1", workspaceId: "ws-1" })],
          ["a2", agent({ id: "a2", workspaceId: "ws-1", archivedAt: NOW })],
        ]),
      },
    } as never;

    expect(
      collectWorkspaceAgentDoneKeys(sessions, [
        { serverId: "srv", workspaceId: "ws-1" },
        { serverId: "gone", workspaceId: "ws-9" },
      ]),
    ).toEqual(["srv:a1"]);
  });
});
