import React, { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import {
  useSidebarWorkspacesList,
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
  type SidebarWorkspacesListResult,
} from "@/hooks/use-sidebar-workspaces-list";
import { useSidebarWorkspaceEntries } from "@/hooks/use-sidebar-workspace-entries";
import { useStatusBucketLabels } from "@/hooks/sidebar-status-view-model";
import { usePinnedSidebarKeys, type PinnedSidebarGroups } from "@/hooks/use-sidebar-pins";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import {
  hasActiveSidebarLabelFilter,
  useSidebarViewStore,
  type SidebarGroupMode,
} from "@/stores/sidebar-view-store";
import { useSessionStore } from "@/stores/session-store";
import { useAgentDoneStore } from "@/stores/agent-done-store";
import { useShallow } from "zustand/shallow";
import {
  resolveEffectiveCollapsedProjectKeys,
  resolveLiveProjectKeys,
} from "@/components/sidebar/sidebar-project-collapse";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import type { SidebarShortcutModel } from "@/utils/sidebar-shortcuts";
import { buildSidebarProjection } from "./sidebar-projection";
import type { SidebarProjectIconTarget } from "@/utils/sidebar-project-row-model";
import { filterWorkspacesByLabels, type SidebarWorkspaceGroup } from "./sidebar-labels";
import { filterWorkspacesByProjects, resolveActiveProjectFilters } from "./sidebar-project-filter";
import {
  hasAuthoritativeWorkspaceLabelCatalog,
  useWorkspaceLabelProjection,
} from "@/workspace-labels";

interface SidebarModel extends SidebarWorkspacesListResult {
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  /** Every project the sidebar could show, before any filter narrows it. */
  allProjects: SidebarProjectEntry[];
  /** The project filter as it is actually being applied. */
  resolvedProjectFilters: readonly string[];
  hasProjectsBeforeFilter: boolean;
  groupMode: SidebarGroupMode;
  workspaceGroups: SidebarWorkspaceGroup[];
  projectIconTargets: SidebarProjectIconTarget[];
  pinnedGroups: PinnedSidebarGroups;
  collapsedProjectKeys: ReadonlySet<string>;
  toggleProjectCollapsed: (projectViewKey: string) => void;
  shortcutModel: SidebarShortcutModel;
}

const SidebarModelContext = createContext<SidebarModel | null>(null);

export function SidebarModelProvider({
  active,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  const list = useSidebarWorkspacesList();
  const groupMode = useSidebarViewStore((state) => state.groupMode);
  const labelFilter = useSidebarViewStore((state) => state.labelFilter);
  const projectFilters = useSidebarViewStore((state) => state.projectFilters);
  const reconcileLabelFilter = useSidebarViewStore((state) => state.reconcileLabelFilter);
  const { hosts: labelHosts } = useWorkspaceLabelProjection();
  const collapsedProjectKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedProjectKeys,
  );
  const collapsedWorkspaceGroupKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedWorkspaceGroupKeys,
  );
  const expandedProjectKeys = useSidebarCollapsedSectionsStore(
    (state) => state.expandedProjectKeys,
  );
  const setProjectCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.setProjectCollapsed,
  );
  const setProjectExpanded = useSidebarCollapsedSectionsStore((state) => state.setProjectExpanded);
  const pinnedCollapsed = useSidebarCollapsedSectionsStore((state) => state.collapsedPinned);
  const pinnedWorkspaceOrder = useSidebarOrderStore((state) => state.pinnedWorkspaceOrder);
  const manualDoneKeys = useAgentDoneStore((state) => state.manuallyDoneAgentKeys);
  const availableLabelNames = useMemo(
    () => labelHosts.flatMap((host) => host.labels.map((label) => label.name)),
    [labelHosts],
  );
  const hasAuthoritativeLabelCatalog = hasAuthoritativeWorkspaceLabelCatalog(labelHosts);
  useEffect(() => {
    if (!hasAuthoritativeLabelCatalog) return;
    reconcileLabelFilter(availableLabelNames);
  }, [availableLabelNames, hasAuthoritativeLabelCatalog, reconcileLabelFilter]);
  const hasActiveLabelFilter = hasActiveSidebarLabelFilter(labelFilter);
  const resolvedProjectFilters = useMemo(
    () =>
      resolveActiveProjectFilters(
        projectFilters,
        new Set(list.projects.map((project) => project.viewKey)),
      ),
    [projectFilters, list.projects],
  );
  const hasActiveProjectFilter = resolvedProjectFilters.length > 0;
  // Project filters only need placement data; labels and status grouping need hydrated entries.
  const needsWorkspaceEntries = groupMode !== "project" || hasActiveLabelFilter;
  const workspaceEntriesByKey = useSidebarWorkspaceEntries(
    list.workspacePlacements,
    active !== false || needsWorkspaceEntries,
  );
  const filteredWorkspaceEntriesByKey = useMemo(() => {
    const byProject = filterWorkspacesByProjects({
      workspaces: [...workspaceEntriesByKey.values()],
      projectFilters: resolvedProjectFilters,
    });
    const filtered = filterWorkspacesByLabels({ workspaces: byProject, ...labelFilter });
    return new Map(filtered.map((workspace) => [workspace.workspaceKey, workspace]));
  }, [labelFilter, resolvedProjectFilters, workspaceEntriesByKey]);
  const visibleWorkspaceKeys = useMemo(
    () => new Set(filteredWorkspaceEntriesByKey.keys()),
    [filteredWorkspaceEntriesByKey],
  );
  const filteredProjects = useMemo(() => {
    let projects = list.projects;
    if (hasActiveProjectFilter) {
      const included = new Set(resolvedProjectFilters);
      projects = projects.filter((project) => included.has(project.viewKey));
    }
    if (hasActiveLabelFilter) {
      projects = projects.flatMap((project) => {
        const workspaces = project.workspaces.filter((workspace) =>
          visibleWorkspaceKeys.has(workspace.workspaceKey),
        );
        return workspaces.length > 0 ? [{ ...project, workspaces }] : [];
      });
    }
    return projects;
  }, [
    hasActiveLabelFilter,
    hasActiveProjectFilter,
    resolvedProjectFilters,
    list.projects,
    visibleWorkspaceKeys,
  ]);

  // Projects with a live agent stay expanded by default; explicit user choices always win.
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
        projects: filteredProjects,
      }),
    [collapsedProjectKeys, expandedProjectKeys, liveProjectKeys, filteredProjects],
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

  const pinnedKeys = usePinnedSidebarKeys(filteredProjects);
  const statusBucketLabels = useStatusBucketLabels();
  const projectionInput = useMemo(
    () => ({
      projects: filteredProjects,
      pinnedKeys,
      pinnedWorkspaceOrder,
      workspaceEntriesByKey: filteredWorkspaceEntriesByKey,
      projectNamesByViewKey: list.projectNamesByViewKey,
      groupMode,
      pinnedCollapsed,
      collapsedProjectKeys: effectiveCollapsedProjectKeys,
      collapsedWorkspaceGroupKeys,
      statusBucketLabels,
    }),
    [
      collapsedWorkspaceGroupKeys,
      effectiveCollapsedProjectKeys,
      filteredProjects,
      filteredWorkspaceEntriesByKey,
      groupMode,
      list.projectNamesByViewKey,
      pinnedCollapsed,
      pinnedKeys,
      pinnedWorkspaceOrder,
      statusBucketLabels,
    ],
  );
  const projection = useMemo(() => buildSidebarProjection(projectionInput), [projectionInput]);
  const value = useMemo(
    () => ({
      ...list,
      projects: filteredProjects,
      allProjects: list.projects,
      resolvedProjectFilters,
      hasProjectsBeforeFilter: list.projects.length > 0,
      workspaceEntriesByKey: filteredWorkspaceEntriesByKey,
      groupMode,
      workspaceGroups: projection.workspaceGroups,
      projectIconTargets: projection.projectIconTargets,
      pinnedGroups: projection.pinnedGroups,
      collapsedProjectKeys: effectiveCollapsedProjectKeys,
      toggleProjectCollapsed,
      shortcutModel: projection.shortcutModel,
    }),
    [
      effectiveCollapsedProjectKeys,
      filteredProjects,
      filteredWorkspaceEntriesByKey,
      groupMode,
      list,
      projection,
      resolvedProjectFilters,
      toggleProjectCollapsed,
    ],
  );

  return <SidebarModelContext.Provider value={value}>{children}</SidebarModelContext.Provider>;
}

export function useSidebarModel(): SidebarModel {
  const model = useContext(SidebarModelContext);
  if (!model) throw new Error("SidebarModelProvider is required");
  return model;
}
