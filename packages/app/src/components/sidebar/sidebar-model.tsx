import React, { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import {
  useSidebarWorkspacesList,
  type SidebarWorkspaceEntry,
  type SidebarWorkspacesListResult,
} from "@/hooks/use-sidebar-workspaces-list";
import { useSidebarWorkspaceEntries } from "@/hooks/use-sidebar-workspace-entries";
import type { StatusGroup } from "@/hooks/sidebar-status-view-model";
import { useStatusBucketLabels } from "@/hooks/sidebar-status-view-model";
import { usePinnedSidebarKeys, type PinnedSidebarGroups } from "@/hooks/use-sidebar-pins";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import { useSidebarViewStore, type SidebarGroupMode } from "@/stores/sidebar-view-store";
import { useSessionStore } from "@/stores/session-store";
import { useAgentDoneStore } from "@/stores/agent-done-store";
import { useShallow } from "zustand/shallow";
import {
  resolveEffectiveCollapsedProjectKeys,
  resolveLiveProjectKeys,
} from "@/components/sidebar/sidebar-project-collapse";
import type { SidebarShortcutModel } from "@/utils/sidebar-shortcuts";
import { buildSidebarProjection } from "./sidebar-projection";

interface SidebarModel extends SidebarWorkspacesListResult {
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  groupMode: SidebarGroupMode;
  statusGroups: StatusGroup[];
  pinnedGroups: PinnedSidebarGroups;
  collapsedProjectKeys: ReadonlySet<string>;
  toggleProjectCollapsed: (projectViewKey: string) => void;
  shortcutModel: SidebarShortcutModel;
}

const SidebarModelContext = createContext<SidebarModel | null>(null);
const EMPTY_WORKSPACE_ENTRIES = new Map<string, SidebarWorkspaceEntry>();

export function SidebarModelProvider({
  active,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  const list = useSidebarWorkspacesList();
  const groupMode = useSidebarViewStore((state) => state.groupMode);
  const collapsedProjectKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedProjectKeys,
  );
  const collapsedStatusGroupKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedStatusGroupKeys,
  );
  const expandedProjectKeys = useSidebarCollapsedSectionsStore(
    (state) => state.expandedProjectKeys,
  );
  const setProjectCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.setProjectCollapsed,
  );
  const setProjectExpanded = useSidebarCollapsedSectionsStore((state) => state.setProjectExpanded);
  const pinnedCollapsed = useSidebarCollapsedSectionsStore((state) => state.collapsedPinned);
  const isStatusMode = groupMode === "status";
  const manualDoneKeys = useAgentDoneStore((state) => state.manuallyDoneAgentKeys);
  const workspaceEntriesByKey = useSidebarWorkspaceEntries(
    list.workspacePlacements,
    active !== false || isStatusMode,
  );

  // Projects with at least one non-done, non-archived agent stay expanded by
  // default; everything else starts collapsed until the user expands it.
  const liveProjectKeys = useSessionStore(
    useShallow(
      (state) =>
        new Set([...resolveLiveProjectKeys(state.sessions, list.projects, manualDoneKeys)].sort()),
    ),
  );

  const effectiveCollapsedProjectKeys = useMemo(
    () =>
      resolveEffectiveCollapsedProjectKeys({
        collapsedProjectKeys,
        expandedProjectKeys,
        liveProjectKeys,
        projects: list.projects,
      }),
    [collapsedProjectKeys, expandedProjectKeys, liveProjectKeys, list.projects],
  );

  const toggleProjectCollapsed = useCallback(
    (projectKey: string) => {
      if (effectiveCollapsedProjectKeys.has(projectKey)) {
        setProjectCollapsed(projectKey, false);
        setProjectExpanded(projectKey, true);
      } else {
        setProjectCollapsed(projectKey, true);
        setProjectExpanded(projectKey, false);
      }
    },
    [effectiveCollapsedProjectKeys, setProjectCollapsed, setProjectExpanded],
  );
  const projectionWorkspaceEntriesByKey = isStatusMode
    ? workspaceEntriesByKey
    : EMPTY_WORKSPACE_ENTRIES;
  const pinnedKeys = usePinnedSidebarKeys(list.projects);
  const statusBucketLabels = useStatusBucketLabels();
  const projection = useMemo(
    () =>
      buildSidebarProjection({
        projects: list.projects,
        pinnedKeys,
        workspaceEntriesByKey: projectionWorkspaceEntriesByKey,
        projectNamesByViewKey: list.projectNamesByViewKey,
        groupMode,
        pinnedCollapsed,
        collapsedProjectKeys: effectiveCollapsedProjectKeys,
        collapsedStatusGroupKeys,
        statusBucketLabels,
      }),
    [
      effectiveCollapsedProjectKeys,
      collapsedStatusGroupKeys,
      groupMode,
      list.projectNamesByViewKey,
      list.projects,
      pinnedCollapsed,
      pinnedKeys,
      projectionWorkspaceEntriesByKey,
      statusBucketLabels,
    ],
  );
  const value = useMemo(
    () => ({
      ...list,
      workspaceEntriesByKey,
      groupMode,
      statusGroups: projection.statusGroups,
      pinnedGroups: projection.pinnedGroups,
      collapsedProjectKeys: effectiveCollapsedProjectKeys,
      toggleProjectCollapsed,
      shortcutModel: projection.shortcutModel,
    }),
    [
      effectiveCollapsedProjectKeys,
      groupMode,
      list,
      projection,
      toggleProjectCollapsed,
      workspaceEntriesByKey,
    ],
  );

  return <SidebarModelContext.Provider value={value}>{children}</SidebarModelContext.Provider>;
}

export function useSidebarModel(): SidebarModel {
  const model = useContext(SidebarModelContext);
  if (!model) throw new Error("SidebarModelProvider is required");
  return model;
}
