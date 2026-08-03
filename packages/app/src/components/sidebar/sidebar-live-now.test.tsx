/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Agent } from "@/stores/session-store";

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

const theme = vi.hoisted(() => ({
  colors: {
    foreground: "#111",
    foregroundMuted: "#666",
    foregroundExtraMuted: "#888",
    surface1: "#fff",
    surfaceSidebarHover: "#eee",
    border: "#ddd",
    borderAccent: "#ccc",
  },
  spacing: { 1: 4, 1.5: 6, 2: 8, 3: 12, 6: 24 },
  iconSize: { sm: 14 },
  fontSize: { xs: 12, sm: 14 },
  fontWeight: { medium: "500", semibold: "600" },
  fontFamily: { mono: "monospace" },
  borderRadius: { md: 6, lg: 8 },
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

vi.mock("@/stores/session-store", async () => {
  const { create } = await import("zustand");
  return { useSessionStore: create(() => ({ sessions: {} })) };
});

vi.mock("@/stores/agent-done-store", async () => {
  const { create } = await import("zustand");
  return {
    agentDoneKey: (serverId: string, agentId: string) => `${serverId}:${agentId}`,
    useAgentDoneStore: create(() => ({ manuallyDoneAgentKeys: new Set<string>() })),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { percentage?: number }) => {
      if (key === "contextWindow.used") {
        return `${options?.percentage}% used`;
      }
      return (
        {
          "agentList.fallbackTitle": "Untitled agent",
          "sidebar.liveNow.title": "Live now",
          "sidebar.liveNow.empty": "No agents running",
          "sidebar.statusBuckets.needsInput": "Needs input",
          "sidebar.statusBuckets.failed": "Failed",
          "sidebar.statusBuckets.attention": "Ready to review",
          "sidebar.statusBuckets.running": "Working",
          "sidebar.statusBuckets.done": "Done",
          "sidebar.workspace.actions.showMore": "Show more",
          "sidebar.workspace.actions.showLess": "Show less",
        }[key] ?? key
      );
    },
  }),
}));

vi.mock("lucide-react-native", () => ({
  ChevronDown: () => null,
  ChevronUp: () => null,
  CircleDot: () => null,
}));

vi.mock("@/components/provider-icons", () => ({
  getProviderIcon: () => () => null,
}));

vi.mock("@/agent-controls/icons", () => ({ MODE_ICONS: {} }));
vi.mock("@/agent-controls/labels", () => ({
  formatAgentModeLabel: () => null,
  formatThinkingOptionLabel: () => null,
}));
vi.mock("@/composer/agent-controls/model-sheet", () => ({ shortModelLabel: () => null }));
vi.mock("@/utils/time", () => ({ formatTimeAgo: () => "now" }));
vi.mock("@/utils/navigate-to-agent", () => ({ navigateToAgent: vi.fn() }));
vi.mock("@/components/ui/pulsing-dot", () => ({
  PulsingHalo: () => null,
  PulsingDot: () => null,
}));
vi.mock("@/components/sidebar/sidebar-agent-row", () => ({
  AgentContextBar: ({ percent }: { percent: number }) => `${percent}%`,
  AgentRowMetaLine: () => null,
  AgentStatusIcon: () => null,
}));

import { useAgentDoneStore } from "@/stores/agent-done-store";
import { useSessionStore } from "@/stores/session-store";
import { SidebarLiveNowSection } from "./sidebar-live-now";

const NOW = new Date("2026-07-31T00:00:00.000Z");

function agent(id: string, overrides: Partial<Agent> = {}): Agent {
  return {
    id,
    serverId: "srv",
    provider: "claude",
    status: "running",
    title: `Agent ${id}`,
    cwd: "/repo/main",
    workspaceId: "ws-1",
    model: null,
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    archivedAt: null,
    lastActivityAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Agent;
}

function archiveStoredAgent(agentId: string): void {
  useSessionStore.setState((state) => {
    const session = state.sessions.srv!;
    const agents = new Map(session.agents);
    agents.set(agentId, { ...agents.get(agentId)!, archivedAt: NOW });
    return { sessions: { ...state.sessions, srv: { ...session, agents } } };
  });
}

function removeStoredWorkspaces(): void {
  useSessionStore.setState((state) => ({
    sessions: {
      ...state.sessions,
      srv: { ...state.sessions.srv!, workspaces: new Map() },
    },
  }));
}

describe("SidebarLiveNowSection", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    useAgentDoneStore.setState({ manuallyDoneAgentKeys: new Set() });
    useSessionStore.setState({
      sessions: {
        srv: {
          agents: new Map([
            ["a1", agent("a1", { status: "idle" as never, pendingPermissions: [{}] as never })],
            [
              "a2",
              agent("a2", {
                lastUsage: { contextWindowMaxTokens: 200_000, contextWindowUsedTokens: 190_000 },
              }),
            ],
            ["a3", agent("a3")],
            ["a4", agent("a4")],
            ["a5", agent("a5")],
          ]),
          workspaces: new Map([
            [
              "ws-1",
              {
                id: "ws-1",
                title: "Workspace One",
                name: "main",
                projectDisplayName: "Paseo",
              },
            ],
          ]),
          hasHydratedWorkspaces: true,
        },
      },
    } as never);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useSessionStore.setState({ sessions: {} } as never);
  });

  it("limits busy lists, exposes context, and reacts to manual completion", () => {
    act(() => root.render(<SidebarLiveNowSection />));

    expect(container.querySelectorAll('[data-testid^="sidebar-live-now-row-"]')).toHaveLength(4);
    expect(
      container
        .querySelector('[data-testid="sidebar-live-now-row-srv-a1"]')
        ?.getAttribute("aria-label"),
    ).toContain("Needs input, Paseo/Workspace One");

    expect(
      container
        .querySelector('[data-testid="sidebar-live-now-row-srv-a2"]')
        ?.getAttribute("aria-label"),
    ).toContain("95% used");

    const toggle = container.querySelector(
      '[data-testid="sidebar-live-now-toggle"]',
    ) as HTMLElement;
    expect(toggle).not.toBeNull();
    act(() => toggle.click());
    expect(container.querySelectorAll('[data-testid^="sidebar-live-now-row-"]')).toHaveLength(5);

    act(() => {
      useAgentDoneStore.setState({ manuallyDoneAgentKeys: new Set(["srv:a1"]) });
    });
    expect(container.querySelector('[data-testid="sidebar-live-now-row-srv-a1"]')).toBeNull();
    expect(container.querySelectorAll('[data-testid^="sidebar-live-now-row-"]')).toHaveLength(4);

    act(() => {
      useAgentDoneStore.setState({
        manuallyDoneAgentKeys: new Set(["srv:a1", "srv:a2", "srv:a3", "srv:a4", "srv:a5"]),
      });
    });
    expect(container.querySelector('[data-testid="sidebar-live-now"]')).not.toBeNull();
    expect(container.textContent).toContain("No agents running");
  });

  it("reacts to archived agents and removed workspaces", () => {
    act(() => root.render(<SidebarLiveNowSection />));

    act(() => {
      archiveStoredAgent("a1");
    });
    expect(container.querySelector('[data-testid="sidebar-live-now-row-srv-a1"]')).toBeNull();

    act(() => {
      removeStoredWorkspaces();
    });
    expect(container.querySelectorAll('[data-testid^="sidebar-live-now-row-"]')).toHaveLength(0);
    expect(container.textContent).toContain("No agents running");
  });
});
