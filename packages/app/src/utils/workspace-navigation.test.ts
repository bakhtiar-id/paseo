import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => {}),
    removeItem: vi.fn(async () => {}),
  },
}));
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";
import { prepareWorkspaceTab } from "@/utils/prepare-workspace-tab";
import {
  collectAllPanes,
  collectAllTabs,
  findPaneContainingTab,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { preparePaneForTarget, prepareWorkspaceTerminalPane } from "@/utils/workspace-navigation";

const SERVER_ID = "server-1";
const WORKSPACE_ID = "/repo/worktree";
const AGENT_ID = "agent-1";

interface RecordedOpenedTab {
  key: string;
  target: WorkspaceTabTarget;
}

interface RecordedPin {
  key: string;
  agentId: string;
}

function createFakeLayout() {
  const openedTabs: RecordedOpenedTab[] = [];
  const pinnedAgents: RecordedPin[] = [];
  const preparedTargets: RecordedOpenedTab[] = [];
  return {
    openedTabs,
    pinnedAgents,
    preparedTargets,
    preparePaneForTarget: (key: string, target: WorkspaceTabTarget) => {
      preparedTargets.push({ key, target });
    },
    openTabFocused: (key: string, target: WorkspaceTabTarget) => {
      openedTabs.push({ key, target });
      return target.kind === "agent" ? target.agentId : null;
    },
    pinAgent: (key: string, agentId: string) => {
      pinnedAgents.push({ key, agentId });
    },
  };
}

describe("prepareWorkspaceTab", () => {
  it("opens and focuses an agent tab", () => {
    const layout = createFakeLayout();

    prepareWorkspaceTab(
      {
        serverId: SERVER_ID,
        workspaceId: WORKSPACE_ID,
        target: { kind: "agent", agentId: AGENT_ID },
      },
      layout,
    );

    expect(layout.openedTabs).toEqual([
      { key: "server-1:/repo/worktree", target: { kind: "agent", agentId: AGENT_ID } },
    ]);
    expect(layout.preparedTargets).toEqual(layout.openedTabs);
    expect(layout.pinnedAgents).toEqual([]);
  });

  it("keeps a project terminal in its own pane when an agent opens", () => {
    const workspaceKey = `${SERVER_ID}:${WORKSPACE_ID}`;
    const store = useWorkspaceLayoutStore.getState();
    store.purgeWorkspace(workspaceKey);

    prepareWorkspaceTerminalPane({
      serverId: SERVER_ID,
      workspaceId: WORKSPACE_ID,
      terminalId: "terminal-1",
    });
    preparePaneForTarget(workspaceKey, { kind: "agent", agentId: AGENT_ID });
    store.openTabFocused(workspaceKey, { kind: "agent", agentId: AGENT_ID });

    const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
    const tabs = collectAllTabs(layout.root);
    const terminalTab = tabs.find((tab) => tab.target.kind === "terminal");
    const agentTab = tabs.find((tab) => tab.target.kind === "agent");
    expect(collectAllPanes(layout.root)).toHaveLength(2);
    expect(findPaneContainingTab(layout.root, terminalTab!.tabId)?.id).not.toBe(
      findPaneContainingTab(layout.root, agentTab!.tabId)?.id,
    );

    store.purgeWorkspace(workspaceKey);
  });
});
