import type { Agent } from "@/stores/session-store";
import { deriveSidebarStateBucket } from "@/utils/sidebar-agent-state";

export interface SidebarProjectRef {
  viewKey: string;
  workspaces: ReadonlyArray<{ serverId: string; workspaceId: string }>;
}

/** Workspaces count as "done" only once every agent has been quiet for a day. */
export const DONE_SWEEP_IDLE_MS = 24 * 60 * 60 * 1000;

interface SessionAgentsRef {
  agents: Map<string, Agent>;
}

/**
 * Whether a workspace belongs in the collapsed "done" group. Swept only when
 * every agent is done AND quiet for DONE_SWEEP_IDLE_MS (or manually marked
 * done via the row menu). Not-yet-hydrated workspaces stay visible.
 */
export function shouldSweepWorkspace(input: {
  hydrated: boolean;
  agents: readonly Agent[];
  manualDoneKeys: ReadonlySet<string>;
  nowMs: number;
}): boolean {
  if (!input.hydrated) {
    return false;
  }
  if (input.agents.length === 0) {
    return false;
  }
  const agents = input.agents.filter((agent) => !agent.archivedAt);
  if (agents.length === 0) {
    return true;
  }
  for (const agent of agents) {
    const manuallyDone = input.manualDoneKeys.has(`${agent.serverId}:${agent.id}`);
    if (manuallyDone) {
      continue;
    }
    const bucket = deriveSidebarStateBucket({
      status: agent.status,
      pendingPermissionCount: agent.pendingPermissions.length,
      requiresAttention: agent.requiresAttention,
      attentionReason: agent.attentionReason,
    });
    if (bucket !== "done") {
      return false;
    }
    if (input.nowMs - agent.lastActivityAt.getTime() < DONE_SWEEP_IDLE_MS) {
      return false;
    }
  }
  return true;
}

/**
 * Done keys for every non-archived agent across the given workspaces. The
 * project menu's "mark all as done" sets these to sweep a whole project
 * without waiting for DONE_SWEEP_IDLE_MS.
 */
export function collectWorkspaceAgentDoneKeys(
  sessions: Record<string, SessionAgentsRef | undefined>,
  workspaces: ReadonlyArray<{ serverId: string; workspaceId: string }>,
): string[] {
  const keys: string[] = [];
  for (const workspace of workspaces) {
    const session = sessions[workspace.serverId];
    if (!session) continue;
    for (const agent of session.agents.values()) {
      if (agent.archivedAt || agent.workspaceId !== workspace.workspaceId) continue;
      keys.push(`${agent.serverId}:${agent.id}`);
    }
  }
  return keys;
}

/** Project keys that have at least one live (non-done, non-archived) agent. */
export function resolveLiveProjectKeys(
  sessions: Record<string, SessionAgentsRef | undefined>,
  projects: readonly SidebarProjectRef[],
  manualDoneKeys: ReadonlySet<string>,
): Set<string> {
  const projectKeyByWorkspace = new Map<string, string>();
  for (const project of projects) {
    for (const placement of project.workspaces) {
      projectKeyByWorkspace.set(`${placement.serverId}:${placement.workspaceId}`, project.viewKey);
    }
  }
  const live = new Set<string>();
  for (const [serverId, session] of Object.entries(sessions)) {
    if (!session) continue;
    for (const agent of session.agents.values()) {
      if (agent.archivedAt || !agent.workspaceId) continue;
      if (manualDoneKeys.has(`${agent.serverId}:${agent.id}`)) continue;
      const bucket = deriveSidebarStateBucket({
        status: agent.status,
        pendingPermissionCount: agent.pendingPermissions.length,
        requiresAttention: agent.requiresAttention,
        attentionReason: agent.attentionReason,
      });
      if (bucket === "done") continue;
      const projectKey = projectKeyByWorkspace.get(`${serverId}:${agent.workspaceId}`);
      if (projectKey) {
        live.add(projectKey);
      }
    }
  }
  return live;
}

/**
 * Effective collapse: user-collapsed projects plus idle projects (no live
 * agents) that the user never explicitly expanded.
 */
export function resolveEffectiveCollapsedProjectKeys(input: {
  collapsedProjectKeys: ReadonlySet<string>;
  expandedProjectKeys: ReadonlySet<string>;
  liveProjectKeys: ReadonlySet<string>;
  projects: readonly SidebarProjectRef[];
}): Set<string> {
  const next = new Set(input.collapsedProjectKeys);
  for (const project of input.projects) {
    if (
      !input.liveProjectKeys.has(project.viewKey) &&
      !input.expandedProjectKeys.has(project.viewKey)
    ) {
      next.add(project.viewKey);
    }
  }
  return next;
}
