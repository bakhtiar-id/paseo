import {
  collectAllPanes,
  collectAllTabs,
  findPaneById,
  findPaneContainingTab,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTabTarget } from "@/workspace-tabs/model";
import {
  prepareWorkspaceTab as prepareWorkspaceTabPure,
  type PrepareWorkspaceTabInput,
} from "./prepare-workspace-tab";

export type { PrepareWorkspaceTabInput } from "./prepare-workspace-tab";

function layoutStoreDeps() {
  const store = useWorkspaceLayoutStore.getState();
  return {
    openTabFocused: store.openTabFocused,
    pinAgent: store.pinAgent,
    preparePaneForTarget,
  };
}

export function preparePaneForTarget(workspaceKey: string, target: WorkspaceTabTarget): void {
  if (target.kind !== "agent" && target.kind !== "draft") return;
  const store = useWorkspaceLayoutStore.getState();
  const layout = store.layoutByWorkspace[workspaceKey];
  if (!layout?.focusedPaneId) return;
  const tabsById = new Map(collectAllTabs(layout.root).map((tab) => [tab.tabId, tab]));
  const focusedPane = findPaneById(layout.root, layout.focusedPaneId);
  if (
    !focusedPane?.tabIds.length ||
    !focusedPane.tabIds.every((tabId) => tabsById.get(tabId)?.target.kind === "terminal")
  ) {
    return;
  }
  const conversationPane = collectAllPanes(layout.root).find(
    (pane) =>
      pane.id !== focusedPane.id &&
      pane.tabIds.every((tabId) => tabsById.get(tabId)?.target.kind !== "terminal"),
  );
  if (conversationPane) store.focusPane(workspaceKey, conversationPane.id);
}

export function prepareWorkspaceTerminalPane(input: {
  serverId: string;
  workspaceId: string;
  terminalId: string;
}): void {
  const workspaceKey = buildWorkspaceTabPersistenceKey(input);
  if (!workspaceKey) return;
  const store = useWorkspaceLayoutStore.getState();
  const tabId = store.openTabFocused(workspaceKey, {
    kind: "terminal",
    terminalId: input.terminalId,
  });
  if (!tabId) return;
  const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
  if (!layout) return;
  const pane = findPaneContainingTab(layout.root, tabId);
  const panes = collectAllPanes(layout.root);
  if (!pane || (pane.tabIds.length === 1 && panes.length > 1)) return;
  store.splitPane(workspaceKey, {
    tabId,
    targetPaneId: pane.id,
    position: "bottom",
  });
}

export function prepareWorkspaceTab(input: PrepareWorkspaceTabInput): void {
  prepareWorkspaceTabPure(input, layoutStoreDeps());
}
