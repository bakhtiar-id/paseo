import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";

export interface SidebarProjectHostTarget {
  serverId: string;
  iconWorkingDir: string;
}

export interface SidebarProjectTerminalTarget {
  serverId: string;
  workspaceId: string;
  workspaceDirectory: string;
  scriptTerminalIds: ReadonlySet<string>;
}

export type SidebarProjectTrailingAction =
  | { kind: "new_workspace"; target: SidebarProjectHostTarget }
  | { kind: "none" };

export interface SidebarProjectSectionRowModel {
  kind: "project_section";
  chevron: "expand" | "collapse";
  trailingAction: SidebarProjectTrailingAction;
}

export type SidebarProjectRowModel = SidebarProjectSectionRowModel;

const EMPTY_MULTIPLICITY_MAP: ReadonlyMap<string, boolean> = new Map();

function hostTarget(input: {
  serverId: string;
  iconWorkingDir: string;
}): SidebarProjectHostTarget | null {
  const iconWorkingDir = input.iconWorkingDir.trim();
  if (!input.serverId || !iconWorkingDir) {
    return null;
  }
  return { serverId: input.serverId, iconWorkingDir };
}

export function resolveSidebarProjectIconTarget(
  project: SidebarProjectEntry,
): SidebarProjectHostTarget | null {
  for (const host of project.hosts) {
    const target = hostTarget(host);
    if (target) {
      return target;
    }
  }
  return null;
}

export function resolveSidebarProjectTerminalTarget(
  project: SidebarProjectEntry,
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>,
): SidebarProjectTerminalTarget | null {
  for (const host of project.hosts) {
    const entries = project.workspaces
      .map((workspace) => workspaceEntriesByKey.get(workspace.workspaceKey))
      .filter((entry) => entry?.serverId === host.serverId);
    const entry =
      entries.find((candidate) => candidate?.workspaceDirectory === host.iconWorkingDir) ??
      entries.find(
        (candidate) =>
          candidate?.workspaceKind === "local_checkout" ||
          candidate?.workspaceKind === "directory" ||
          candidate?.workspaceKind === "checkout",
      );
    if (!entry?.workspaceDirectory) continue;
    return {
      serverId: entry.serverId,
      workspaceId: entry.workspaceId,
      workspaceDirectory: entry.workspaceDirectory,
      scriptTerminalIds: new Set(
        entry.scripts.flatMap((script) => (script.terminalId ? [script.terminalId] : [])),
      ),
    };
  }
  return null;
}

// A project can host a brand-new workspace on a host when that host can create a
// git worktree (git projects) OR the host supports running multiple independent
// workspaces per directory (`workspaceMultiplicity`), which is what lets non-git
// directories add a second workspace. Mirrors the gate used by the global "New
// workspace" affordances (use-global-new-workspace-action.ts and left-sidebar's
// SidebarNewWorkspaceHeaderRow): `canCreateWorktree || supportsMultiplicity`.
function resolveNewWorkspaceTarget(
  project: SidebarProjectEntry,
  supportsMultiplicityByServerId: ReadonlyMap<string, boolean>,
): SidebarProjectHostTarget | null {
  for (const host of project.hosts) {
    if (!host.canCreateWorktree && !supportsMultiplicityByServerId.get(host.serverId)) {
      continue;
    }
    const target = hostTarget(host);
    if (target) {
      return target;
    }
  }
  return null;
}

function projectTrailingAction(
  project: SidebarProjectEntry,
  supportsMultiplicityByServerId: ReadonlyMap<string, boolean>,
): SidebarProjectTrailingAction {
  const target = resolveNewWorkspaceTarget(project, supportsMultiplicityByServerId);
  return target ? { kind: "new_workspace", target } : { kind: "none" };
}

export function buildSidebarProjectRowModel(input: {
  project: SidebarProjectEntry;
  collapsed: boolean;
  supportsMultiplicityByServerId?: ReadonlyMap<string, boolean>;
}): SidebarProjectRowModel {
  return {
    kind: "project_section",
    chevron: input.collapsed ? "expand" : "collapse",
    trailingAction: projectTrailingAction(
      input.project,
      input.supportsMultiplicityByServerId ?? EMPTY_MULTIPLICITY_MAP,
    ),
  };
}
