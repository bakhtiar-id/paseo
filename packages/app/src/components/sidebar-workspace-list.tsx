import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  type GestureResponderEvent,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useMutation } from "@tanstack/react-query";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import {
  memo,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
  type ReactElement,
  type MutableRefObject,
  type ReactNode,
  type Ref,
  type ComponentProps,
  type PropsWithChildren,
} from "react";
import { useTranslation } from "react-i18next";
import { router, usePathname, type Href } from "expo-router";
import {
  navigateToWorkspace,
  useActiveWorkspaceSelection,
  type ActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { getSidebarRowBackdrop } from "@/components/sidebar/sidebar-row-backdrop";
import { type GestureType } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import * as Clipboard from "expo-clipboard";
import {
  CircleCheck,
  ExternalLink,
  Eye,
  EyeOff,
  GitPullRequest,
  Settings,
  MoreVertical,
  Plus,
  SquareTerminal,
  Trash2,
} from "lucide-react-native";
import { NestableScrollContainer } from "react-native-draggable-flatlist";
import { DraggableList, type DraggableRenderItemInfo } from "./draggable-list";
import type { DraggableListDragHandleProps } from "./draggable-list.types";
import { getHostRuntimeStore, useHosts } from "@/runtime/host-runtime";
import type { PinnedSidebarGroups } from "@/hooks/use-sidebar-pins";
import {
  useSidebarWorkspacePinController,
  type ToggleSidebarWorkspacePin,
} from "@/hooks/use-sidebar-workspace-pin";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import { useHostFeatureMap } from "@/runtime/host-features";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useProjectIcons } from "@/projects/icons";
import {
  buildNewWorkspaceRoute,
  buildHostWorkspaceRoute,
  buildProjectSettingsRoute,
  parseHostWorkspaceRouteFromPathname,
} from "@/utils/host-routes";
import {
  shouldShowSidebarHostLabels,
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
  type SidebarWorkspacePlacement,
} from "@/hooks/use-sidebar-workspaces-list";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import { useShowShortcutBadges } from "@/hooks/use-show-shortcut-badges";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  useContextMenu,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ProjectLeadingVisual } from "@/components/sidebar/project-leading-visual";
import { useToast } from "@/contexts/toast-context";
import { getForgePresentation, normalizeForge } from "@/git/forge";
import { toWorktreeArchiveRisk } from "@/git/worktree-archive-warning";
import { hasVisibleOrderChanged, mergeWithRemainder } from "@/utils/sidebar-reorder";
import { confirmDialog } from "@/utils/confirm-dialog";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { SidebarStatusWorkspaceList } from "@/components/sidebar/sidebar-status-list";
import {
  STATUS_BUCKET_ORDER,
  useStatusBucketLabels,
  type StatusGroup,
} from "@/hooks/sidebar-status-view-model";
import {
  SidebarWorkspaceContextMenu,
  SidebarWorkspaceMenu,
} from "@/components/sidebar/sidebar-workspace-menu";
import { useLongPressDragInteraction } from "@/components/sidebar/use-long-press-drag-interaction";
import { PinnedSectionHeader } from "@/components/sidebar/pinned-section-header";
import { SidebarGroupToggleRow } from "@/components/sidebar/sidebar-group-toggle-row";
import { SidebarWorkspaceAgentRows } from "@/components/sidebar/sidebar-agent-row";
import { SidebarDoneWorkspacesToggle } from "@/components/sidebar/sidebar-done-workspaces-toggle";
import {
  collectWorkspaceAgentDoneKeys,
  shouldSweepWorkspace,
} from "@/components/sidebar/sidebar-project-collapse";
import { useAgentDoneStore } from "@/stores/agent-done-store";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { useShallow } from "zustand/shallow";
import { useLimitedSidebarGroup } from "@/components/sidebar/use-limited-sidebar-group";
import {
  SidebarWorkspaceRowFrame,
  SidebarWorkspaceRowContent,
  SidebarWorkspaceShortcutBadge,
  resolveTrailingActionVisibility,
  SidebarWorkspaceTrailingActionBase,
  SidebarWorkspaceTrailingActionOverlay,
  SidebarWorkspaceTrailingActionSlot,
} from "@/components/sidebar/sidebar-workspace-row-content";
import { useOpenKebabMenuVisibility } from "@/components/sidebar/use-open-kebab-menu-visibility";
import { selectWorkspaceScriptSummary } from "@/components/sidebar/workspace-meta-row";
import {
  SidebarWorkspaceTrailingContent,
  useSidebarWorkspaceTrailing,
} from "@/components/sidebar/workspace-trailing";
import {
  UsageSubtitle,
  useProjectUsage,
  type UsageAggregate,
} from "@/components/sidebar/sidebar-usage-strip";
import { Button } from "@/components/ui/button";
import { PressHighlight } from "@/components/ui/press-highlight";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Shortcut } from "@/components/ui/shortcut";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import { useClearWorkspaceAttention } from "@/hooks/use-clear-workspace-attention";
import type { PrHint } from "@/git/use-pr-status-query";
import {
  buildSidebarProjectRowModel,
  resolveSidebarProjectIconTargets,
  resolveSidebarProjectLocalPath,
  resolveSidebarProjectTerminalTarget,
  type SidebarProjectHostTarget,
  type SidebarProjectTerminalTarget,
} from "@/utils/sidebar-project-row-model";
import { prepareWorkspaceTerminalPane } from "@/utils/workspace-navigation";
import { selectProjectWorkspacesToArchive } from "@/workspace/project-workspace-archive";
import { archiveWorkspacesOptimistically } from "@/workspace/workspace-archive";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { openExternalUrl } from "@/utils/open-external-url";
import { requireWorkspaceDirectory } from "@/utils/workspace-directory";
import { useWorkspaceArchive } from "@/workspace/use-workspace-archive";
import {
  getCurrentProjectRemoveReadiness,
  removeProjectFromHosts,
} from "@/projects/project-remove";
import {
  isWeb as platformIsWeb,
  isNative as platformIsNative,
  getIsElectron,
} from "@/constants/platform";
import { getDesktopHost } from "@/desktop/host";
import { OpenInFileManagerMenuItem } from "@/workspace/open-in-file-manager/menu-item";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import type { HostBadgeModel } from "@/hosts/appearance";
import { useHostBadges } from "@/hosts/use-host-badges";
import { useSidebarRowItems } from "@/components/sidebar/display-preferences/model";

const workspaceKeyExtractor = (workspace: SidebarWorkspacePlacement) => workspace.workspaceKey;

const projectViewKeyExtractor = (project: SidebarProjectEntry) => project.viewKey;

const WORKSPACE_STATUS_DOT_WIDTH = 14;
const ThemedExternalLink = withUnistyles(ExternalLink);
const ThemedGitPullRequest = withUnistyles(GitPullRequest);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const ThemedPlus = withUnistyles(Plus);
const ThemedMoreVertical = withUnistyles(MoreVertical);
const ThemedTrash2 = withUnistyles(Trash2);
const ThemedSettings = withUnistyles(Settings);
const ThemedSquareTerminal = withUnistyles(SquareTerminal);
const ThemedEye = withUnistyles(Eye);
const ThemedEyeOff = withUnistyles(EyeOff);
const ThemedCircleCheck = withUnistyles(CircleCheck);

const foregroundColorMapping = (theme: Theme) => ({
  color: theme.colors.foreground,
});
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const redColorMapping = (theme: Theme) => ({
  color: theme.colors.statusMutedDanger,
});
const greenColorMapping = (theme: Theme) => ({
  color: theme.colors.statusMutedSuccess,
});
const purpleColorMapping = (theme: Theme) => ({
  color: theme.colors.statusMutedMerged,
});

function getPrIconUniMapping(state: PrHint["state"]) {
  switch (state) {
    case "merged":
      return purpleColorMapping;
    case "open":
      return greenColorMapping;
    case "closed":
      return redColorMapping;
  }
}

function isWorkspaceSelected(input: {
  selection: ActiveWorkspaceSelection | null;
  serverId: string | null;
  workspaceId: string;
  enabled: boolean;
}): boolean {
  return (
    input.enabled &&
    input.selection?.serverId === input.serverId &&
    input.selection.workspaceId === input.workspaceId
  );
}

function isProjectSelectedByRoute(input: {
  selection: ActiveWorkspaceSelection | null;
  project: SidebarProjectEntry;
  enabled: boolean;
}): boolean {
  return (
    input.enabled &&
    input.project.workspaces.some(
      (workspace) =>
        workspace.serverId === input.selection?.serverId &&
        workspace.workspaceId === input.selection.workspaceId,
    )
  );
}

function activeWorkspaceSelectionKey(selection: ActiveWorkspaceSelection | null): string {
  return selection ? `${selection.serverId}:${selection.workspaceId}` : "";
}

function selectionForSelectedWorkspace(
  selected: boolean,
  workspace: SidebarWorkspaceEntry,
): ActiveWorkspaceSelection | null {
  return selected ? { serverId: workspace.serverId, workspaceId: workspace.workspaceId } : null;
}

interface SidebarWorkspaceListProps {
  statusGroups: StatusGroup[];
  pinnedGroups: PinnedSidebarGroups;
  projects: SidebarProjectEntry[];
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  collapsedProjectKeys: ReadonlySet<string>;
  onToggleProjectCollapsed: (projectViewKey: string) => void;
  shortcutIndexByWorkspaceKey: Map<string, number>;
  groupMode: "project" | "status";
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onWorkspacePress?: () => void;
  onAddProject?: () => void;
  listFooterComponent?: ReactElement | null;
  // Rendered inside the scroll area, below the Pinned section and above the workspace
  // list. Holds the "Workspaces" section header so pinned items sit above it.
  listHeaderComponent?: ReactElement | null;
  /** Gesture ref for coordinating with parent gestures (e.g., sidebar close) */
  parentGestureRef?: MutableRefObject<GestureType | undefined>;
  dragGestureHostPresented?: boolean;
}

interface ProjectHeaderRowProps {
  project: SidebarProjectEntry;
  displayName: string;
  iconDataUri: string | null;
  statusBucket: SidebarStateBucket | null;
  selected?: boolean;
  chevron: "expand" | "collapse" | null;
  onPress: () => void;
  worktreeTarget: SidebarProjectHostTarget | null;
  isProjectActive?: boolean;
  onWorkspacePress?: () => void;
  onWorktreeCreated?: (workspaceId: string) => void;
  shortcutNumber?: number | null;
  showShortcutBadge?: boolean;
  drag: () => void;
  isDragging: boolean;
  isArchiving?: boolean;
  menuController: ReturnType<typeof useContextMenu> | null;
  onRemoveProject?: () => void;
  removeProjectStatus?: "idle" | "pending";
  dragHandleProps?: DraggableListDragHandleProps;
  /** Small muted usage line under the project title: aggregate tokens + active time. */
  usage?: UsageAggregate | null;
  terminalTarget: SidebarProjectTerminalTarget | null;
  terminalLoading: boolean;
  onTerminalPress: () => void;
  statusRollup?: SidebarProjectStatusRollupItem[];
  statusRollupLiveCount?: number;
  doneCount?: number;
  doneExpanded?: boolean;
  onToggleDone?: () => void;
  onMarkAllDone?: () => void;
}

export interface SidebarProjectStatusRollupItem {
  bucket: SidebarStateBucket;
  count: number;
}

const EMPTY_STATUS_ROLLUP: SidebarProjectStatusRollupItem[] = [];

interface WorkspaceRowInnerProps {
  workspace: SidebarWorkspaceEntry;
  hostBadge?: HostBadgeModel | null;
  leadingProjectName?: string | null;
  leadingProjectIconDataUri?: string | null;
  selected: boolean;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  onPress: () => void;
  drag: () => void;
  isDragging: boolean;
  isArchiving: boolean;
  isCreating?: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
  menuController: ReturnType<typeof useContextMenu> | null;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  onArchive?: () => void;
  onCopyBranchName?: () => void;
  onCopyPath?: () => void;
  onRename?: () => void;
  onMarkAsRead?: () => void;
  archiveShortcutKeys?: ShortcutKey[][] | null;
  isPinned?: boolean;
  onTogglePin?: () => void;
  reserveIdleStatusIndicatorSpace?: boolean;
}

export function PrBadge({ hint, style }: { hint: PrHint; style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
  }, []);

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      void openExternalUrl(hint.url);
    },
    [hint.url],
  );

  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);

  // Callers that place the badge in a list of icon+text rows pass that row's layout in, so the
  // icon and text land on the same rails as their neighbors instead of on the badge's tighter
  // inline spacing.
  const pressableStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      prBadgeStyles.badge,
      style,
      pressed && prBadgeStyles.badgePressed,
    ],
    [style],
  );

  const textStyle = isHovered
    ? [prBadgeStyles.text, prBadgeStyles.textHovered]
    : prBadgeStyles.text;
  const iconUniProps = isHovered ? foregroundColorMapping : getPrIconUniMapping(hint.state);
  const presentation = getForgePresentation(normalizeForge(hint.forge));

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t("workspace.git.pr.accessibility.pullRequest", {
        number: hint.number,
        context: presentation.changeRequestContext,
      })}
      hitSlop={4}
      onPressIn={handlePressIn}
      onPress={handlePress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={pressableStyle}
    >
      {isHovered ? (
        <ThemedExternalLink size={12} uniProps={iconUniProps} />
      ) : (
        <ThemedGitPullRequest size={12} uniProps={iconUniProps} />
      )}
      <Text style={textStyle} numberOfLines={1}>
        {hint.number}
      </Text>
    </Pressable>
  );
}

function projectKebabStyle({
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.projectKebabButton, hovered && styles.projectKebabButtonHovered];
}

function getProjectWorkspaceRowStyle({
  isDragging,
  selected,
  isHovered,
}: {
  isDragging: boolean;
  selected: boolean;
  isHovered: boolean;
}) {
  return [
    styles.workspaceRow,
    isDragging && styles.workspaceRowDragging,
    selected && styles.sidebarRowSelected,
    isHovered && styles.workspaceRowHovered,
  ];
}

function noop() {}

const prBadgeStyles = StyleSheet.create((theme) => ({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  badgePressed: {
    opacity: 0.82,
  },
  text: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 14,
    color: theme.colors.foregroundMuted,
  },
  textHovered: {
    color: theme.colors.foreground,
  },
}));

function ProjectRowTrailingActions({
  projectViewKey,
  displayName,
  worktreeTarget,
  terminalTarget,
  terminalLoading,
  onTerminalPress,
  settingsTarget,
  projectPath,
  isHovered: _isHovered,
  isMobileBreakpoint: _isMobileBreakpoint,
  isProjectActive,
  onBeginWorkspaceSetup,
  onRemoveProject,
  removeProjectStatus,
  doneCount,
  doneExpanded,
  onToggleDone,
  onMarkAllDone,
}: {
  projectViewKey: string;
  displayName: string;
  worktreeTarget: SidebarProjectHostTarget | null;
  terminalTarget: SidebarProjectTerminalTarget | null;
  terminalLoading: boolean;
  onTerminalPress: () => void;
  settingsTarget: { serverId: string; projectId: string } | null;
  projectPath: string;
  isHovered: boolean;
  isMobileBreakpoint: boolean;
  isProjectActive: boolean;
  onBeginWorkspaceSetup: () => void;
  onRemoveProject?: () => void;
  removeProjectStatus: "idle" | "pending" | "success";
  doneCount?: number;
  doneExpanded?: boolean;
  onToggleDone?: () => void;
  onMarkAllDone?: () => void;
}) {
  // Project row controls (terminal, new worktree, kebab) stay visible
  // permanently instead of hiding behind hover.
  const actionsVisible = true;
  return (
    <View style={styles.projectTrailingActions}>
      {terminalTarget ? (
        <ProjectTerminalButton
          loading={terminalLoading}
          onPress={onTerminalPress}
          visible={actionsVisible}
          testID={`sidebar-project-terminal-${projectViewKey}`}
        />
      ) : null}
      {worktreeTarget ? (
        <NewWorktreeButton
          displayName={displayName}
          onPress={onBeginWorkspaceSetup}
          visible={actionsVisible}
          showShortcutHint={isProjectActive}
          testID={`sidebar-project-new-worktree-${projectViewKey}`}
        />
      ) : null}
      {onRemoveProject ? (
        <View
          style={!actionsVisible && styles.projectKebabButtonHidden}
          pointerEvents={actionsVisible ? "auto" : "none"}
        >
          <ProjectKebabMenu
            projectViewKey={projectViewKey}
            settingsTarget={settingsTarget}
            projectPath={projectPath}
            onRemoveProject={onRemoveProject}
            removeProjectStatus={removeProjectStatus}
            doneCount={doneCount}
            doneExpanded={doneExpanded}
            onToggleDone={onToggleDone}
            onMarkAllDone={onMarkAllDone}
          />
        </View>
      ) : null}
    </View>
  );
}

const doneShowLeadingIcon = <ThemedEye size={14} uniProps={foregroundMutedColorMapping} />;
const doneHideLeadingIcon = <ThemedEyeOff size={14} uniProps={foregroundMutedColorMapping} />;
const markAllDoneLeadingIcon = (
  <ThemedCircleCheck size={14} uniProps={foregroundMutedColorMapping} />
);
const trash2LeadingIcon = <ThemedTrash2 size={14} uniProps={foregroundMutedColorMapping} />;
const settingsLeadingIcon = <ThemedSettings size={14} uniProps={foregroundMutedColorMapping} />;
const openInNewWindowLeadingIcon = (
  <ThemedExternalLink size={14} uniProps={foregroundMutedColorMapping} />
);

function renderKebabTriggerIcon({ hovered }: { hovered?: boolean }) {
  return (
    <ThemedMoreVertical
      size={14}
      uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
    />
  );
}

function ProjectKebabMenu({
  projectViewKey,
  settingsTarget,
  projectPath,
  onRemoveProject,
  removeProjectStatus,
  doneCount,
  doneExpanded,
  onToggleDone,
  onMarkAllDone,
}: {
  projectViewKey: string;
  settingsTarget: { serverId: string; projectId: string } | null;
  projectPath: string;
  onRemoveProject: () => void;
  removeProjectStatus: "idle" | "pending" | "success";
  /** Done workspaces swept behind the project; 0 hides the toggle item. */
  doneCount?: number;
  doneExpanded?: boolean;
  onToggleDone?: () => void;
  /** Sweeps every live workspace into the done group; absent when none remain. */
  onMarkAllDone?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu compactMode="sheet">
      <DropdownMenuTrigger
        hitSlop={8}
        style={projectKebabStyle}
        accessibilityRole={platformIsWeb ? undefined : "button"}
        accessibilityLabel={t("sidebar.project.actions.menu")}
        testID={`sidebar-project-kebab-${projectViewKey}`}
      >
        {renderKebabTriggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={220} sheetTitle={t("sidebar.project.actions.menu")}>
        <ProjectMenuItems
          surface="dropdown"
          projectViewKey={projectViewKey}
          settingsTarget={settingsTarget}
          projectPath={projectPath}
          onRemoveProject={onRemoveProject}
          removeProjectStatus={removeProjectStatus}
          doneCount={doneCount}
          doneExpanded={doneExpanded}
          onToggleDone={onToggleDone}
          onMarkAllDone={onMarkAllDone}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ProjectMenuSurface = "context" | "dropdown";

function ProjectMenuItem({
  surface,
  children,
  ...props
}: PropsWithChildren<
  Omit<ComponentProps<typeof DropdownMenuItem>, "children"> & { surface: ProjectMenuSurface }
>) {
  if (surface === "context") {
    return <ContextMenuItem {...props}>{children}</ContextMenuItem>;
  }
  return <DropdownMenuItem {...props}>{children}</DropdownMenuItem>;
}

function ProjectMenuItems({
  surface,
  projectViewKey,
  settingsTarget,
  projectPath,
  onRemoveProject,
  removeProjectStatus,
  doneCount = 0,
  doneExpanded = false,
  onToggleDone,
  onMarkAllDone,
}: {
  surface: ProjectMenuSurface;
  projectViewKey: string;
  settingsTarget: { serverId: string; projectId: string } | null;
  projectPath: string;
  onRemoveProject: () => void;
  removeProjectStatus: "idle" | "pending" | "success";
  doneCount?: number;
  doneExpanded?: boolean;
  onToggleDone?: () => void;
  onMarkAllDone?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const handleOpenProjectSettings = useCallback(() => {
    if (!settingsTarget) return;
    router.navigate(buildProjectSettingsRoute(settingsTarget.serverId, settingsTarget.projectId));
  }, [settingsTarget]);
  const canOpenInNewWindow = getIsElectron() && projectPath.trim().length > 0;
  const handleOpenInNewWindow = useCallback(() => {
    const trimmedPath = projectPath.trim();
    if (trimmedPath.length === 0) return;
    void getDesktopHost()
      ?.window?.openNew?.({ pendingOpenProjectPath: trimmedPath })
      ?.catch((error) => {
        console.warn("[sidebar] openNew failed", error);
        toast.error(t("sidebar.project.actions.openNewWindowFailed"));
      });
  }, [projectPath, t, toast]);

  return (
    <>
      {doneCount > 0 && onToggleDone ? (
        <ProjectMenuItem
          surface={surface}
          testID={`sidebar-project-menu-toggle-done-${projectViewKey}`}
          leading={doneExpanded ? doneHideLeadingIcon : doneShowLeadingIcon}
          onSelect={onToggleDone}
        >
          {doneExpanded
            ? t("sidebar.project.actions.hideDone")
            : t("sidebar.project.actions.showDone", { count: doneCount })}
        </ProjectMenuItem>
      ) : null}
      {onMarkAllDone ? (
        <ProjectMenuItem
          surface={surface}
          testID={`sidebar-project-menu-mark-all-done-${projectViewKey}`}
          leading={markAllDoneLeadingIcon}
          onSelect={onMarkAllDone}
        >
          {t("sidebar.project.actions.markAllDone")}
        </ProjectMenuItem>
      ) : null}
      {settingsTarget ? (
        <ProjectMenuItem
          surface={surface}
          testID={`sidebar-project-menu-open-settings-${projectViewKey}`}
          leading={settingsLeadingIcon}
          onSelect={handleOpenProjectSettings}
        >
          {t("sidebar.project.actions.openSettings")}
        </ProjectMenuItem>
      ) : null}
      {canOpenInNewWindow ? (
        <ProjectMenuItem
          surface={surface}
          testID={`sidebar-project-menu-open-new-window-${projectViewKey}`}
          leading={openInNewWindowLeadingIcon}
          onSelect={handleOpenInNewWindow}
        >
          {t("sidebar.project.actions.openNewWindow")}
        </ProjectMenuItem>
      ) : null}
      <OpenInFileManagerMenuItem
        surface={surface}
        path={projectPath}
        testID={`sidebar-project-menu-open-folder-${projectViewKey}`}
      />
      <ProjectMenuItem
        surface={surface}
        testID={`sidebar-project-menu-remove-${projectViewKey}`}
        leading={trash2LeadingIcon}
        status={removeProjectStatus}
        pendingLabel={t("sidebar.project.actions.removing")}
        onSelect={onRemoveProject}
      >
        {t("sidebar.project.actions.remove")}
      </ProjectMenuItem>
    </>
  );
}

function WorkspaceRowRightGroup({
  workspace,
  isHovered,
  isTouchPlatform,
  isCreating,
  showShortcutBadge,
  shortcutNumber,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
  onArchive,
  onMarkAsRead,
  onCopyBranchName,
  onCopyPath,
  onRename,
  isPinned,
  onTogglePin,
}: {
  workspace: SidebarWorkspaceEntry;
  isHovered: boolean;
  isTouchPlatform: boolean;
  isCreating: boolean;
  showShortcutBadge: boolean;
  shortcutNumber: number | null;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
  onArchive?: () => void;
  onMarkAsRead?: () => void;
  onCopyBranchName?: () => void;
  onCopyPath?: () => void;
  onRename?: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
}) {
  const workspacePath = workspace.workspaceDirectory ?? workspace.projectRootPath;
  const { t } = useTranslation();
  const trailing = useSidebarWorkspaceTrailing();
  const showShortcut = showShortcutBadge && shortcutNumber !== null;
  const {
    showTrailing,
    showKebab: showKebabInSlot,
    showScrim,
    renderSlot,
    reserveSlotWidth,
  } = resolveTrailingActionVisibility({
    workspace,
    trailing,
    hasArchiveAction: Boolean(onArchive),
    isHovered,
    isTouchPlatform,
    showShortcut,
  });
  const kebab = useOpenKebabMenuVisibility(showKebabInSlot);

  return (
    <>
      {isCreating ? (
        <Text style={styles.workspaceCreatingText}>{t("sidebar.workspace.status.creating")}</Text>
      ) : null}
      {renderSlot ? (
        <SidebarWorkspaceTrailingActionSlot reserveWidth={reserveSlotWidth}>
          <SidebarWorkspaceTrailingActionBase visible={showTrailing}>
            <SidebarWorkspaceTrailingContent workspace={workspace} trailing={trailing} />
          </SidebarWorkspaceTrailingActionBase>
          <SidebarWorkspaceTrailingActionOverlay visible={kebab.showKebab} scrim={showScrim}>
            {onArchive ? (
              <SidebarWorkspaceMenu
                {...kebab.menuProps}
                workspaceKey={workspace.workspaceKey}
                onCopyPath={onCopyPath}
                onCopyBranchName={onCopyBranchName}
                onRename={onRename}
                onMarkAsRead={onMarkAsRead}
                onArchive={onArchive}
                archiveLabel={archiveLabel}
                archiveStatus={archiveStatus}
                archivePendingLabel={archivePendingLabel}
                archiveShortcutKeys={archiveShortcutKeys}
                isPinned={isPinned}
                onTogglePin={onTogglePin}
                openInFileManagerPath={workspacePath}
              />
            ) : null}
          </SidebarWorkspaceTrailingActionOverlay>
        </SidebarWorkspaceTrailingActionSlot>
      ) : null}
    </>
  );
}

function NewWorktreeButton({
  displayName,
  onPress,
  visible,
  loading = false,
  testID,
  showShortcutHint = false,
}: {
  displayName: string;
  onPress: () => void;
  visible: boolean;
  loading?: boolean;
  testID: string;
  showShortcutHint?: boolean;
}) {
  const { t } = useTranslation();
  const newWorktreeKeys = useShortcutKeys("new-worktree");

  const pressableStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.projectIconActionButton,
      !visible && styles.projectIconActionButtonHidden,
      (Boolean(hovered) || pressed) && !loading && styles.projectIconActionButtonHovered,
    ],
    [visible, loading],
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onPress();
    },
    [onPress],
  );

  return (
    <View style={styles.projectTrailingControlSlot} pointerEvents={visible ? "auto" : "none"}>
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild disabled={!visible}>
          <Pressable
            style={pressableStyle}
            onPress={handlePress}
            disabled={loading}
            accessibilityRole={platformIsWeb ? undefined : "button"}
            accessibilityLabel={t("sidebar.workspace.actions.createWorkspaceFor", {
              projectName: displayName,
            })}
            testID={testID}
          >
            {({ hovered, pressed }) =>
              loading ? (
                <ThemedLoadingSpinner size={14} uniProps={foregroundMutedColorMapping} />
              ) : (
                <ThemedPlus
                  size={15}
                  uniProps={
                    hovered || pressed ? foregroundColorMapping : foregroundMutedColorMapping
                  }
                />
              )
            }
          </Pressable>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center" offset={8}>
          <View style={styles.projectActionTooltipRow}>
            <Text style={styles.projectActionTooltipText}>
              {t("sidebar.workspace.actions.newWorkspace")}
            </Text>
            {showShortcutHint && newWorktreeKeys ? (
              <Shortcut chord={newWorktreeKeys} style={styles.projectActionTooltipShortcut} />
            ) : null}
          </View>
        </TooltipContent>
      </Tooltip>
    </View>
  );
}

function ProjectTerminalButton({
  loading,
  onPress,
  visible = true,
  testID,
}: {
  loading: boolean;
  onPress: () => void;
  visible?: boolean;
  testID: string;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onPress();
    },
    [onPress],
  );
  const pressableStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.projectIconActionButton,
      !visible && styles.projectIconActionButtonHidden,
      (Boolean(hovered) || pressed) && !loading && styles.projectIconActionButtonHovered,
    ],
    [visible, loading],
  );

  return (
    <View style={styles.projectTrailingControlSlot} pointerEvents={visible ? "auto" : "none"}>
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild disabled={!visible}>
          <Pressable
            style={pressableStyle}
            onPress={handlePress}
            disabled={loading}
            hitSlop={4}
            accessibilityRole={platformIsWeb ? undefined : "button"}
            accessibilityLabel={t("workspace.tabs.fallback.terminal")}
            testID={testID}
          >
            {({ hovered, pressed }) =>
              loading ? (
                <ThemedLoadingSpinner size={14} uniProps={foregroundMutedColorMapping} />
              ) : (
                <ThemedSquareTerminal
                  size={15}
                  uniProps={
                    hovered || pressed ? foregroundColorMapping : foregroundMutedColorMapping
                  }
                />
              )
            }
          </Pressable>
        </TooltipTrigger>
      </Tooltip>
    </View>
  );
}

// Pills for in-flight states pulse gently (0.83Hz - same rhythm as the pulsing
// dot). Failed/done stay static: motion means "in progress".
const PULSING_ROLLUP_BUCKETS: ReadonlySet<SidebarStateBucket> = new Set([
  "needs_input",
  "running",
  "attention",
]);

function RollupPillPulse({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value * 0.35 }));

  if (reduceMotion) {
    return <View>{children}</View>;
  }
  return <Animated.View style={pulseStyle}>{children}</Animated.View>;
}

const STATUS_ROLLUP_VARIANT: Record<
  SidebarStateBucket,
  "success" | "error" | "warning" | "info" | "muted"
> = {
  needs_input: "warning",
  failed: "error",
  running: "info",
  attention: "success",
  done: "muted",
};

function SidebarProjectStatusRollup({
  items,
  liveCount,
}: {
  items: SidebarProjectStatusRollupItem[];
  liveCount: number;
}) {
  const statusBucketLabels = useStatusBucketLabels();
  if (liveCount === 0) {
    return null;
  }
  // Count every non-done workspace, not just the ones with a live agent: an
  // idle workspace (no active agent) must still make the badge visible.
  const activeCount = liveCount;
  return (
    <View style={styles.projectStatusRollup} testID="sidebar-project-status-rollup">
      <View
        style={styles.projectActiveCountBadge}
        accessibilityLabel={`${activeCount} active`}
        testID="sidebar-project-active-count"
      >
        <Text style={styles.projectActiveCountBadgeText}>{activeCount}</Text>
      </View>
      {items.slice(0, 3).map((item) => (
        <View
          key={item.bucket}
          accessibilityLabel={`${item.count} ${statusBucketLabels[item.bucket]}`}
        >
          {PULSING_ROLLUP_BUCKETS.has(item.bucket) ? (
            <RollupPillPulse>
              <StatusBadge label={`${item.count}`} variant={STATUS_ROLLUP_VARIANT[item.bucket]} />
            </RollupPillPulse>
          ) : (
            <StatusBadge label={`${item.count}`} variant={STATUS_ROLLUP_VARIANT[item.bucket]} />
          )}
        </View>
      ))}
    </View>
  );
}

function NewWorkspaceGhostRow({
  project,
  displayName,
  worktreeTarget,
  onWorkspacePress,
}: {
  project: SidebarProjectEntry;
  displayName: string;
  worktreeTarget: SidebarProjectHostTarget;
  onWorkspacePress?: () => void;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => {
    onWorkspacePress?.();
    router.navigate(
      buildNewWorkspaceRoute({
        serverId: worktreeTarget.serverId,
        sourceDirectory: worktreeTarget.iconWorkingDir,
        displayName,
        projectId: worktreeTarget.projectId,
      }) as Href,
    );
  }, [displayName, onWorkspacePress, worktreeTarget]);
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.newWorkspaceGhostRow,
      (Boolean(hovered) || pressed) && styles.newWorkspaceGhostRowHovered,
    ],
    [],
  );

  return (
    <Pressable
      accessibilityRole={platformIsWeb ? undefined : "button"}
      accessibilityLabel={t("sidebar.workspace.actions.createWorkspaceFor", {
        projectName: displayName,
      })}
      onPress={handlePress}
      style={rowStyle}
      testID={`sidebar-project-new-workspace-row-${project.viewKey}`}
    >
      {({ hovered, pressed }) => (
        <>
          <View style={styles.newWorkspaceGhostIconSlot}>
            <ThemedPlus
              size={14}
              uniProps={hovered || pressed ? foregroundColorMapping : foregroundMutedColorMapping}
            />
          </View>
          <Text
            style={
              hovered || pressed
                ? styles.newWorkspaceGhostTextHovered
                : styles.newWorkspaceGhostText
            }
            numberOfLines={1}
          >
            {t("sidebar.workspace.actions.newWorkspace")}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// oxlint-disable-next-line complexity
function ProjectHeaderRow({
  project,
  displayName,
  iconDataUri,
  statusBucket,
  selected = false,
  chevron,
  onPress,
  worktreeTarget,
  terminalTarget,
  terminalLoading,
  onTerminalPress,
  isProjectActive = false,
  onWorkspacePress,
  onWorktreeCreated: _onWorktreeCreated,
  shortcutNumber = null,
  showShortcutBadge = false,
  drag,
  isDragging,
  isArchiving = false,
  menuController,
  onRemoveProject,
  removeProjectStatus = "idle",
  dragHandleProps,
  usage,
  statusRollup = EMPTY_STATUS_ROLLUP,
  statusRollupLiveCount = 0,
  doneCount,
  doneExpanded,
  onToggleDone,
  onMarkAllDone,
}: ProjectHeaderRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const isMobileBreakpoint = useIsCompactFormFactor();
  const localDaemonServerId = useLocalDaemonServerId();
  const projectPath = resolveSidebarProjectLocalPath(project, localDaemonServerId);
  const settingsTarget = project.hosts[0] ?? null;
  const handleBeginWorkspaceSetup = useCallback(() => {
    if (!worktreeTarget) {
      return;
    }
    onWorkspacePress?.();
    router.navigate(
      buildNewWorkspaceRoute({
        serverId: worktreeTarget.serverId,
        sourceDirectory: worktreeTarget.iconWorkingDir,
        displayName,
        projectId: worktreeTarget.projectId,
      }) as Href,
    );
  }, [displayName, onWorkspacePress, worktreeTarget]);
  const interaction = useLongPressDragInteraction({
    drag,
    menuController,
  });
  const {
    role: _dragRole,
    tabIndex: _dragTabIndex,
    "aria-roledescription": _dragRoleDescription,
    ...dragAttributes
  } = dragHandleProps?.attributes ?? {};

  const handlePress = useCallback(() => {
    if (interaction.didLongPressRef.current) {
      interaction.didLongPressRef.current = false;
      return;
    }
    onPress();
  }, [interaction.didLongPressRef, onPress]);

  const handlePointerEnter = useCallback(() => {
    if (!contextMenuOpen) setIsHovered(true);
  }, [contextMenuOpen]);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handleContextMenuOpenChange = useCallback((open: boolean) => {
    setContextMenuOpen(open);
    if (open) setIsHovered(false);
  }, []);

  const projectRowStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.projectRow,
      isDragging && styles.projectRowDragging,
      selected && styles.sidebarRowSelected,
      isHovered && styles.projectRowHovered,
      pressed && styles.projectRowPressed,
    ],
    [isDragging, selected, isHovered],
  );

  const rowChildren = (
    <>
      <View style={styles.projectRowLeft}>
        <ProjectLeadingVisual
          displayName={displayName}
          iconDataUri={iconDataUri}
          statusBucket={statusBucket}
          projectViewKey={project.viewKey}
          backdrop={getSidebarRowBackdrop({ isDragging, selected, isHovered })}
          chevron={chevron}
          showChevron={isHovered && chevron !== null}
          isArchiving={isArchiving}
        />

        <View style={[styles.projectTitleGroup, usage ? styles.projectTitleGroupStacked : null]}>
          <Text style={styles.projectTitle} numberOfLines={1}>
            {displayName}
          </Text>
          {usage ? (
            <View style={styles.projectUsageRow}>
              <UsageSubtitle aggregate={usage} />
            </View>
          ) : null}
        </View>
      </View>
      <SidebarProjectStatusRollup items={statusRollup} liveCount={statusRollupLiveCount} />
      <ProjectRowTrailingActions
        projectViewKey={project.viewKey}
        displayName={displayName}
        worktreeTarget={worktreeTarget}
        terminalTarget={terminalTarget}
        terminalLoading={terminalLoading}
        onTerminalPress={onTerminalPress}
        settingsTarget={settingsTarget}
        projectPath={projectPath}
        isHovered={isHovered}
        isMobileBreakpoint={isMobileBreakpoint}
        isProjectActive={isProjectActive}
        onBeginWorkspaceSetup={handleBeginWorkspaceSetup}
        onRemoveProject={onRemoveProject}
        removeProjectStatus={removeProjectStatus}
        doneCount={doneCount}
        doneExpanded={doneExpanded}
        onToggleDone={onToggleDone}
        onMarkAllDone={onMarkAllDone}
      />
      {showShortcutBadge && shortcutNumber !== null ? (
        <View style={styles.projectShortcutBadgeOverlay} pointerEvents="none">
          <SidebarWorkspaceShortcutBadge number={shortcutNumber} />
        </View>
      ) : null}
    </>
  );

  if (!onRemoveProject) {
    return (
      <View
        {...dragAttributes}
        {...dragHandleProps?.listeners}
        ref={dragHandleProps?.setActivatorNodeRef as unknown as Ref<View>}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <PressHighlight
          accessibilityRole="button"
          style={projectRowStyle}
          highlightStyle={styles.projectRowHovered}
          onPressIn={interaction.handlePressIn}
          onTouchMove={interaction.handleTouchMove}
          onPressOut={interaction.handlePressOut}
          onPress={handlePress}
          testID={`sidebar-project-row-${project.viewKey}`}
        >
          {rowChildren}
        </PressHighlight>
      </View>
    );
  }

  return (
    <ContextMenu open={contextMenuOpen} onOpenChange={handleContextMenuOpenChange}>
      <View
        {...dragAttributes}
        {...dragHandleProps?.listeners}
        ref={dragHandleProps?.setActivatorNodeRef as unknown as Ref<View>}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <ContextMenuTrigger
          enabledOnMobile={false}
          accessibilityRole="button"
          style={projectRowStyle}
          highlightStyle={styles.projectRowHovered}
          onPressIn={interaction.handlePressIn}
          onTouchMove={interaction.handleTouchMove}
          onPressOut={interaction.handlePressOut}
          onPress={handlePress}
          testID={`sidebar-project-row-${project.viewKey}`}
        >
          {rowChildren}
        </ContextMenuTrigger>
      </View>
      <ContextMenuContent
        align="start"
        width={220}
        testID={`sidebar-project-context-menu-${project.viewKey}`}
      >
        <ProjectMenuItems
          surface="context"
          projectViewKey={project.viewKey}
          settingsTarget={settingsTarget}
          projectPath={projectPath}
          onRemoveProject={onRemoveProject}
          removeProjectStatus={removeProjectStatus}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

function WorkspaceRowInner({
  workspace,
  hostBadge,
  leadingProjectName,
  leadingProjectIconDataUri,
  selected,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  drag,
  isDragging,
  isArchiving,
  isCreating = false,
  dragHandleProps,
  menuController,
  archiveLabel,
  archiveStatus = "idle",
  archivePendingLabel,
  onArchive,
  onCopyBranchName,
  onCopyPath,
  onRename,
  archiveShortcutKeys,
  isPinned,
  onTogglePin,
  reserveIdleStatusIndicatorSpace = true,
}: WorkspaceRowInnerProps) {
  const _isCompact = useIsCompactFormFactor();
  const isTouchPlatform = platformIsNative;
  const interaction = useLongPressDragInteraction({
    drag,
    menuController,
  });
  const {
    role: _dragRole,
    tabIndex: _dragTabIndex,
    "aria-roledescription": _dragRoleDescription,
    ...dragAttributes
  } = dragHandleProps?.attributes ?? {};

  const handlePress = useCallback(() => {
    if (interaction.didLongPressRef.current) {
      interaction.didLongPressRef.current = false;
      return;
    }
    onPress();
  }, [interaction.didLongPressRef, onPress]);

  const accessibilityState = useMemo(() => ({ selected }), [selected]);

  return (
    <SidebarWorkspaceRowFrame workspace={workspace} isDragging={isDragging}>
      {({ isHovered, contextMenuOpen, onContextMenuOpenChange, hoverHandlers }) => {
        const isDesktop = !isTouchPlatform;
        const scriptSummary = isDesktop ? selectWorkspaceScriptSummary(workspace.scripts) : null;
        const workspaceRowStyle = getProjectWorkspaceRowStyle({
          isDragging,
          selected,
          isHovered,
        });
        return (
          <View
            {...dragAttributes}
            {...dragHandleProps?.listeners}
            ref={dragHandleProps?.setActivatorNodeRef as unknown as Ref<View>}
            style={styles.workspaceRowContainer}
            {...hoverHandlers}
          >
            <SidebarWorkspaceContextMenu
              contextMenuOpen={contextMenuOpen}
              onContextMenuOpenChange={onContextMenuOpenChange}
              workspace={workspace}
              leadingProjectName={leadingProjectName}
              hostBadgeLabel={hostBadge?.label}
              workspaceKey={workspace.workspaceKey}
              onCopyPath={onCopyPath}
              onCopyBranchName={onCopyBranchName}
              onRename={onRename}
              onArchive={onArchive}
              archiveLabel={archiveLabel}
              archiveStatus={archiveStatus}
              archivePendingLabel={archivePendingLabel}
              archiveShortcutKeys={archiveShortcutKeys}
              isPinned={isPinned}
              onTogglePin={onTogglePin}
              openInFileManagerPath={workspace.workspaceDirectory}
              disabled={isArchiving}
              aria-selected={selected}
              accessibilityRole="button"
              accessibilityState={accessibilityState}
              style={workspaceRowStyle}
              highlightStyle={styles.workspaceRowHovered}
              onPressIn={interaction.handlePressIn}
              onTouchMove={interaction.handleTouchMove}
              onPressOut={interaction.handlePressOut}
              onPress={handlePress}
              testID={`sidebar-workspace-row-${workspace.workspaceKey}`}
            >
              <SidebarWorkspaceRowContent
                workspace={workspace}
                hostBadge={hostBadge}
                leadingProjectName={leadingProjectName}
                leadingProjectIconDataUri={leadingProjectIconDataUri}
                scriptSummary={scriptSummary}
                backdrop={getSidebarRowBackdrop({ isDragging, selected, isHovered })}
                isHovered={isHovered}
                isLoading={isArchiving || isCreating}
                isCreating={isCreating}
                shortcutNumber={shortcutNumber}
                showShortcutBadge={showShortcutBadge}
                reserveIdleStatusIndicatorSpace={reserveIdleStatusIndicatorSpace}
              >
                <WorkspaceRowRightGroup
                  workspace={workspace}
                  isHovered={isHovered}
                  isTouchPlatform={isTouchPlatform}
                  isCreating={isCreating}
                  showShortcutBadge={showShortcutBadge}
                  shortcutNumber={shortcutNumber}
                  archiveLabel={archiveLabel}
                  archiveStatus={archiveStatus}
                  archivePendingLabel={archivePendingLabel}
                  archiveShortcutKeys={archiveShortcutKeys}
                  onArchive={onArchive}
                  onCopyBranchName={onCopyBranchName}
                  onCopyPath={onCopyPath}
                  onRename={onRename}
                  isPinned={isPinned}
                  onTogglePin={onTogglePin}
                />
              </SidebarWorkspaceRowContent>
            </SidebarWorkspaceContextMenu>
          </View>
        );
      }}
    </SidebarWorkspaceRowFrame>
  );
}

function WorkspaceRowWithMenu({
  workspace,
  hostBadge,
  leadingProjectName,
  leadingProjectIconDataUri,
  selected,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  drag,
  isDragging,
  dragHandleProps,
  canCopyBranchName,
  canPin,
  onToggleWorkspacePin,
  reserveIdleStatusIndicatorSpace = true,
  isCreating = false,
}: {
  workspace: SidebarWorkspaceEntry;
  hostBadge?: HostBadgeModel | null;
  leadingProjectName?: string | null;
  leadingProjectIconDataUri?: string | null;
  selected: boolean;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  onPress: () => void;
  drag: () => void;
  isDragging: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
  canCopyBranchName: boolean;
  canPin: boolean;
  onToggleWorkspacePin: ToggleSidebarWorkspacePin;
  reserveIdleStatusIndicatorSpace?: boolean;
  isCreating?: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [isHidingWorkspace, setIsHidingWorkspace] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const isArchiving = workspace.archivingAt !== null || isHidingWorkspace;
  const redirectAfterArchive = useCallback(() => {
    redirectIfArchivingActiveWorkspace({
      serverId: workspace.serverId,
      workspaceId: workspace.workspaceId,
      activeWorkspaceSelection: selectionForSelectedWorkspace(selected, workspace),
    });
  }, [selected, workspace]);

  const archiveController = useWorkspaceArchive({
    serverId: workspace.serverId,
    workspaceId: workspace.workspaceId,
    workspaceKind: workspace.workspaceKind,
    name: workspace.name,
    ...toWorktreeArchiveRisk(workspace),
    onArchiveStarted: redirectAfterArchive,
    onSetHiding: setIsHidingWorkspace,
  });

  const handleArchive = useCallback(() => {
    if (isArchiving) {
      return;
    }
    archiveController.archive();
  }, [archiveController, isArchiving]);

  const handleCopyPath = useCallback(() => {
    let copyTargetDirectory: string;
    try {
      copyTargetDirectory = requireWorkspaceDirectory({
        workspaceId: workspace.workspaceId,
        workspaceDirectory: workspace.workspaceDirectory,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("sidebar.workspace.toasts.workspacePathUnavailable"),
      );
      return;
    }
    void Clipboard.setStringAsync(copyTargetDirectory);
    toast.copied(t("sidebar.workspace.toasts.pathCopied"));
  }, [t, toast, workspace.workspaceDirectory, workspace.workspaceId]);

  const handleCopyBranchName = useCallback(() => {
    if (!workspace.currentBranch) {
      return;
    }
    void Clipboard.setStringAsync(workspace.currentBranch);
    toast.copied(t("sidebar.workspace.toasts.branchNameCopied"));
  }, [t, toast, workspace.currentBranch]);

  const renameMutation = useMutation({
    mutationFn: async (title: string) => {
      const client = getHostRuntimeStore().getClient(workspace.serverId);
      if (!client) {
        throw new Error(t("sidebar.workspace.toasts.hostDisconnected"));
      }
      await client.setWorkspaceTitle(workspace.workspaceId, title.length === 0 ? null : title);
    },
  });

  const handleOpenRename = useCallback(() => {
    setIsRenameOpen(true);
  }, []);

  const handleCloseRename = useCallback(() => {
    setIsRenameOpen(false);
  }, []);

  const handleSubmitRename = useCallback(
    async (value: string) => {
      await renameMutation.mutateAsync(value.trim());
    },
    [renameMutation],
  );

  const isPinned = workspace.pinnedAt != null;
  const handleTogglePin = useCallback(() => {
    onToggleWorkspacePin(workspace);
  }, [onToggleWorkspacePin, workspace]);
  const onTogglePin = canPin ? handleTogglePin : undefined;

  const archiveShortcutKeys = useShortcutKeys("archive-workspace");
  const { hasClearableAttention, clearAttention } = useClearWorkspaceAttention({
    serverId: workspace.serverId,
    workspaceId: workspace.workspaceId,
  });
  const handleMarkAsRead = useCallback(() => {
    void clearAttention().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to mark workspace as read");
    });
  }, [clearAttention, toast]);

  useKeyboardActionHandler({
    handlerId: `workspace-archive-${workspace.workspaceKey}`,
    actions: ["workspace.archive"],
    enabled: selected && !isArchiving,
    priority: 0,
    handle: () => {
      handleArchive();
      return true;
    },
  });

  return (
    <>
      <WorkspaceRowInner
        workspace={workspace}
        hostBadge={hostBadge}
        leadingProjectName={leadingProjectName}
        leadingProjectIconDataUri={leadingProjectIconDataUri}
        selected={selected}
        shortcutNumber={shortcutNumber}
        showShortcutBadge={showShortcutBadge}
        onPress={onPress}
        drag={drag}
        isDragging={isDragging}
        isArchiving={isArchiving}
        isCreating={isCreating}
        dragHandleProps={dragHandleProps}
        menuController={null}
        archiveLabel={t("sidebar.workspace.actions.archive")}
        archiveStatus={isArchiving ? "pending" : "idle"}
        archivePendingLabel={t("sidebar.workspace.actions.archiving")}
        onArchive={handleArchive}
        onCopyBranchName={canCopyBranchName ? handleCopyBranchName : undefined}
        onCopyPath={handleCopyPath}
        onRename={handleOpenRename}
        onMarkAsRead={hasClearableAttention ? handleMarkAsRead : undefined}
        archiveShortcutKeys={selected ? archiveShortcutKeys : null}
        isPinned={isPinned}
        onTogglePin={onTogglePin}
        reserveIdleStatusIndicatorSpace={reserveIdleStatusIndicatorSpace}
      />
      <AdaptiveRenameModal
        visible={isRenameOpen}
        title={t("sidebar.workspace.rename.title")}
        initialValue={workspace.title ?? workspace.name}
        placeholder={workspace.name}
        submitLabel={t("sidebar.workspace.rename.submit")}
        onClose={handleCloseRename}
        onSubmit={handleSubmitRename}
        testID={`sidebar-workspace-rename-modal-${workspace.workspaceKey}`}
      />
    </>
  );
}

interface WorkspaceRowItemProps {
  workspace: SidebarWorkspacePlacement;
  workspaceEntry: SidebarWorkspaceEntry | null;
  hostBadge?: HostBadgeModel | null;
  leadingProjectName?: string | null;
  leadingProjectIconDataUri?: string | null;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  canCopyBranchName: boolean;
  canPin: boolean;
  onToggleWorkspacePin: ToggleSidebarWorkspacePin;
  reserveIdleStatusIndicatorSpace?: boolean;
  isCreating?: boolean;
  selectionEnabled: boolean;
  activeWorkspaceSelection: ActiveWorkspaceSelection | null;
  onWorkspacePress?: () => void;
  drag?: () => void;
  isDragging?: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
}

function WorkspaceRowItem({
  workspace,
  workspaceEntry,
  hostBadge,
  leadingProjectName,
  leadingProjectIconDataUri,
  shortcutNumber,
  showShortcutBadge,
  canCopyBranchName,
  canPin,
  onToggleWorkspacePin,
  reserveIdleStatusIndicatorSpace = true,
  isCreating = false,
  selectionEnabled,
  activeWorkspaceSelection,
  onWorkspacePress,
  drag,
  isDragging = false,
  dragHandleProps,
}: WorkspaceRowItemProps) {
  const handlePress = useCallback(() => {
    if (!workspace.serverId) {
      return;
    }
    onWorkspacePress?.();
    navigateToWorkspace({ serverId: workspace.serverId, workspaceId: workspace.workspaceId });
  }, [onWorkspacePress, workspace.serverId, workspace.workspaceId]);

  return (
    <WorkspaceRow
      workspaceEntry={workspaceEntry}
      hostBadge={hostBadge}
      leadingProjectName={leadingProjectName}
      leadingProjectIconDataUri={leadingProjectIconDataUri}
      shortcutNumber={shortcutNumber}
      showShortcutBadge={showShortcutBadge}
      canCopyBranchName={canCopyBranchName}
      canPin={canPin}
      onToggleWorkspacePin={onToggleWorkspacePin}
      reserveIdleStatusIndicatorSpace={reserveIdleStatusIndicatorSpace}
      isCreating={isCreating}
      selected={isWorkspaceSelected({
        selection: activeWorkspaceSelection,
        serverId: workspace.serverId,
        workspaceId: workspace.workspaceId,
        enabled: selectionEnabled,
      })}
      onPress={handlePress}
      drag={drag ?? noop}
      isDragging={isDragging}
      dragHandleProps={dragHandleProps}
    />
  );
}

function areWorkspaceRowItemPropsEqual(
  previous: WorkspaceRowItemProps,
  next: WorkspaceRowItemProps,
): boolean {
  const previousSelected = isWorkspaceSelected({
    selection: previous.activeWorkspaceSelection,
    serverId: previous.workspace.serverId,
    workspaceId: previous.workspace.workspaceId,
    enabled: previous.selectionEnabled,
  });
  const nextSelected = isWorkspaceSelected({
    selection: next.activeWorkspaceSelection,
    serverId: next.workspace.serverId,
    workspaceId: next.workspace.workspaceId,
    enabled: next.selectionEnabled,
  });
  return (
    previous.workspace === next.workspace &&
    previous.workspaceEntry === next.workspaceEntry &&
    previous.hostBadge === next.hostBadge &&
    previous.leadingProjectName === next.leadingProjectName &&
    previous.leadingProjectIconDataUri === next.leadingProjectIconDataUri &&
    previous.shortcutNumber === next.shortcutNumber &&
    previous.showShortcutBadge === next.showShortcutBadge &&
    previous.canCopyBranchName === next.canCopyBranchName &&
    previous.canPin === next.canPin &&
    previous.onToggleWorkspacePin === next.onToggleWorkspacePin &&
    previous.reserveIdleStatusIndicatorSpace === next.reserveIdleStatusIndicatorSpace &&
    previous.isCreating === next.isCreating &&
    previous.onWorkspacePress === next.onWorkspacePress &&
    previous.drag === next.drag &&
    previous.isDragging === next.isDragging &&
    previous.dragHandleProps === next.dragHandleProps &&
    previousSelected === nextSelected
  );
}

const MemoWorkspaceRowItem = memo(WorkspaceRowItem, areWorkspaceRowItemPropsEqual);

function WorkspaceRow({
  workspaceEntry,
  hostBadge,
  leadingProjectName,
  leadingProjectIconDataUri,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  drag,
  isDragging,
  dragHandleProps,
  canCopyBranchName,
  canPin,
  onToggleWorkspacePin,
  reserveIdleStatusIndicatorSpace = true,
  isCreating = false,
  selected,
}: {
  workspaceEntry: SidebarWorkspaceEntry | null;
  hostBadge?: HostBadgeModel | null;
  leadingProjectName?: string | null;
  leadingProjectIconDataUri?: string | null;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  onPress: () => void;
  drag: () => void;
  isDragging: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
  canCopyBranchName: boolean;
  canPin: boolean;
  onToggleWorkspacePin: ToggleSidebarWorkspacePin;
  reserveIdleStatusIndicatorSpace?: boolean;
  isCreating?: boolean;
  selected: boolean;
}) {
  if (!workspaceEntry) {
    return null;
  }

  return (
    <WorkspaceRowWithMenu
      workspace={workspaceEntry}
      hostBadge={hostBadge}
      leadingProjectName={leadingProjectName}
      leadingProjectIconDataUri={leadingProjectIconDataUri}
      selected={selected}
      shortcutNumber={shortcutNumber}
      showShortcutBadge={showShortcutBadge}
      onPress={onPress}
      drag={drag}
      isDragging={isDragging}
      dragHandleProps={dragHandleProps}
      canCopyBranchName={canCopyBranchName}
      canPin={canPin}
      onToggleWorkspacePin={onToggleWorkspacePin}
      reserveIdleStatusIndicatorSpace={reserveIdleStatusIndicatorSpace}
      isCreating={isCreating}
    />
  );
}

function ProjectBlock({
  project,
  workspaceEntriesByKey,
  collapsed,
  displayName,
  iconDataUri,
  selectionEnabled,
  showShortcutBadges,
  shortcutIndexByWorkspaceKey,
  parentGestureRef,
  onToggleCollapsed,
  onWorkspacePress,
  onWorkspaceReorder,
  onWorktreeCreated,
  drag,
  isDragging,
  dragHandleProps,
  useNestable,
  dragGestureHostPresented,
  creatingWorkspaceIds,
  activeWorkspaceSelection,
  hostBadgeByServerId,
  supportsMultiplicityByServerId,
  supportsPinningByServerId,
  onToggleWorkspacePin,
}: {
  project: SidebarProjectEntry;
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  collapsed: boolean;
  displayName: string;
  iconDataUri: string | null;
  selectionEnabled: boolean;
  showShortcutBadges: boolean;
  shortcutIndexByWorkspaceKey: Map<string, number>;
  parentGestureRef?: MutableRefObject<GestureType | undefined>;
  onToggleCollapsed: (projectViewKey: string) => void;
  onWorkspacePress?: () => void;
  onWorkspaceReorder: (projectViewKey: string, workspaces: SidebarWorkspacePlacement[]) => void;
  onWorktreeCreated?: (workspaceId: string) => void;
  drag: () => void;
  isDragging: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
  useNestable: boolean;
  dragGestureHostPresented?: boolean;
  creatingWorkspaceIds: ReadonlySet<string>;
  activeWorkspaceSelection: ActiveWorkspaceSelection | null;
  hostBadgeByServerId: ReadonlyMap<string, HostBadgeModel>;
  supportsMultiplicityByServerId: ReadonlyMap<string, boolean>;
  supportsPinningByServerId: ReadonlyMap<string, boolean>;
  onToggleWorkspacePin: ToggleSidebarWorkspacePin;
}) {
  // Sweep quiet workspaces behind one toggle per project: a workspace joins
  // the done group once every agent on it is done and quiet for a day, or
  // manually marked done from the agent row menu.
  const manualDoneKeys = useAgentDoneStore((state) => state.manuallyDoneAgentKeys);
  const setManuallyDone = useAgentDoneStore((state) => state.setManuallyDone);
  // Stable reactive input only: Object.values yields the store's own session
  // references, which useShallow compares by reference. The Maps are derived in
  // useMemo below instead - building fresh Maps inside the selector made
  // useShallow read an unstable snapshot on every render, which spins
  // useSyncExternalStore into "Maximum update depth exceeded".
  const sessions = useSessionStore(useShallow((state) => Object.values(state.sessions)));
  const workspaceSweepMap = useMemo(() => {
    const sessionsByServerId = new Map(
      sessions.map((session) => [session?.serverId, session] as const),
    );
    const sweep = new Map<string, boolean>();
    const latestActivityByWorkspaceKey = new Map<string, Date>();
    for (const workspace of project.workspaces) {
      const session = sessionsByServerId.get(workspace.serverId);
      const agents: Agent[] = [];
      let latestActivity: Date | null = null;
      if (session) {
        for (const agent of session.agents.values()) {
          if (agent.workspaceId !== workspace.workspaceId) continue;
          if (!agent.archivedAt) agents.push(agent);
          if (!latestActivity || agent.lastActivityAt.getTime() > latestActivity.getTime()) {
            latestActivity = agent.lastActivityAt;
          }
        }
      }
      sweep.set(
        workspace.workspaceKey,
        shouldSweepWorkspace({
          hydrated: workspaceEntriesByKey.has(workspace.workspaceKey),
          agents,
          manualDoneKeys,
          nowMs: Date.now(),
        }),
      );
      if (latestActivity) {
        latestActivityByWorkspaceKey.set(workspace.workspaceKey, latestActivity);
      }
    }
    return { sweep, latestActivityByWorkspaceKey };
  }, [sessions, project.workspaces, workspaceEntriesByKey, manualDoneKeys]);
  const workspaceSweep = useMemo(() => {
    const live: SidebarWorkspacePlacement[] = [];
    const done: SidebarWorkspacePlacement[] = [];
    for (const workspace of project.workspaces) {
      (workspaceSweepMap.sweep.get(workspace.workspaceKey) === true ? done : live).push(workspace);
    }
    // Newest activity first so a just-completed workspace lands on top of done.
    done.sort(
      (a, b) =>
        (workspaceSweepMap.latestActivityByWorkspaceKey.get(b.workspaceKey)?.getTime() ?? 0) -
        (workspaceSweepMap.latestActivityByWorkspaceKey.get(a.workspaceKey)?.getTime() ?? 0),
    );
    return { live, done };
  }, [project.workspaces, workspaceSweepMap]);
  const {
    visibleItems: visibleWorkspaces,
    expanded: workspacesExpanded,
    canToggle: canToggleWorkspaces,
    toggleExpanded: toggleWorkspacesExpanded,
  } = useLimitedSidebarGroup(workspaceSweep.live);
  const [doneExpanded, setDoneExpanded] = useState(false);
  const toggleDoneExpanded = useCallback(() => setDoneExpanded((current) => !current), []);
  const rowModel = useMemo(
    () =>
      buildSidebarProjectRowModel({
        project,
        collapsed,
        supportsMultiplicityByServerId,
      }),
    [collapsed, project, supportsMultiplicityByServerId],
  );
  const projectUsage = useProjectUsage(
    project.workspaces.map((workspace) => workspace.workspaceKey),
  );

  // Per-bucket counts feed the animated status pills on the project row, so a
  // project always shows what's running or waiting even when collapsed. Count
  // only live workspaces: swept (marked-done/archived) rows already dropped
  // out of view, so their pills must drop out too.
  const statusRollup = useMemo(() => {
    const counts = new Map<SidebarStateBucket, number>();
    for (const workspace of workspaceSweep.live) {
      const entry = workspaceEntriesByKey.get(workspace.workspaceKey);
      if (!entry || entry.statusBucket === "done") continue;
      counts.set(entry.statusBucket, (counts.get(entry.statusBucket) ?? 0) + 1);
    }
    const rollup: SidebarProjectStatusRollupItem[] = [];
    for (const bucket of STATUS_BUCKET_ORDER) {
      const count = counts.get(bucket);
      if (count) {
        rollup.push({ bucket, count });
      }
    }
    return rollup;
  }, [workspaceSweep, workspaceEntriesByKey]);

  const active = isProjectSelectedByRoute({
    selection: activeWorkspaceSelection,
    project,
    enabled: selectionEnabled,
  });

  const renderWorkspaceRow = useCallback(
    (
      item: SidebarWorkspacePlacement,
      input?: {
        drag?: () => void;
        isDragging?: boolean;
        dragHandleProps?: DraggableListDragHandleProps;
      },
    ) => {
      return (
        <View>
          <MemoWorkspaceRowItem
            workspace={item}
            workspaceEntry={workspaceEntriesByKey.get(item.workspaceKey) ?? null}
            hostBadge={hostBadgeByServerId.get(item.serverId) ?? null}
            shortcutNumber={shortcutIndexByWorkspaceKey.get(item.workspaceKey) ?? null}
            showShortcutBadge={showShortcutBadges}
            canCopyBranchName={project.projectKind === "git"}
            canPin={supportsPinningByServerId.get(item.serverId) === true}
            onToggleWorkspacePin={onToggleWorkspacePin}
            isCreating={creatingWorkspaceIds.has(item.workspaceId)}
            selectionEnabled={selectionEnabled}
            activeWorkspaceSelection={activeWorkspaceSelection}
            onWorkspacePress={onWorkspacePress}
            drag={input?.drag}
            isDragging={input?.isDragging}
            dragHandleProps={input?.dragHandleProps}
          />
          <SidebarWorkspaceAgentRows
            serverId={item.serverId}
            workspaceId={item.workspaceId}
            onWorkspacePress={onWorkspacePress}
          />
        </View>
      );
    },
    [
      project.projectKind,
      onToggleWorkspacePin,
      supportsPinningByServerId,
      activeWorkspaceSelection,
      creatingWorkspaceIds,
      hostBadgeByServerId,
      onWorkspacePress,
      selectionEnabled,
      shortcutIndexByWorkspaceKey,
      showShortcutBadges,
      workspaceEntriesByKey,
    ],
  );

  const renderWorkspace = useCallback(
    ({
      item,
      drag: workspaceDrag,
      isActive,
      dragHandleProps: workspaceDragHandleProps,
    }: DraggableRenderItemInfo<SidebarWorkspacePlacement>) => {
      return renderWorkspaceRow(item, {
        drag: workspaceDrag,
        isDragging: isActive,
        dragHandleProps: workspaceDragHandleProps,
      });
    },
    [renderWorkspaceRow],
  );

  const handleWorkspaceDragEnd = useCallback(
    (workspaces: SidebarWorkspacePlacement[]) => {
      onWorkspaceReorder(project.viewKey, workspaces);
    },
    [onWorkspaceReorder, project.viewKey],
  );

  const toast = useToast();
  const { t } = useTranslation();
  const [isRemovingProject, setIsRemovingProject] = useState(false);
  const terminalTarget = useMemo(
    () => resolveSidebarProjectTerminalTarget(project, workspaceEntriesByKey),
    [project, workspaceEntriesByKey],
  );
  const terminalMutation = useMutation({
    mutationFn: async () => {
      if (!terminalTarget) {
        throw new Error(t("sidebar.workspace.toasts.workspacePathUnavailable"));
      }
      const client = getHostRuntimeStore().getClient(terminalTarget.serverId);
      if (!client) {
        throw new Error(t("workspace.terminal.hostDisconnected"));
      }
      const listed = await client.listTerminals(terminalTarget.workspaceDirectory, undefined, {
        workspaceId: terminalTarget.workspaceId,
      });
      const existing = listed.terminals.find(
        (terminal) => !terminalTarget.scriptTerminalIds.has(terminal.id),
      );
      if (existing) {
        return existing.id;
      }
      const created = await client.createTerminal(
        terminalTarget.workspaceDirectory,
        undefined,
        undefined,
        { workspaceId: terminalTarget.workspaceId },
      );
      if (!created.terminal) {
        throw new Error(created.error ?? t("workspace.terminal.unableToSubscribe"));
      }
      return created.terminal.id;
    },
    onSuccess: (terminalId) => {
      if (!terminalTarget) return;
      prepareWorkspaceTerminalPane({
        serverId: terminalTarget.serverId,
        workspaceId: terminalTarget.workspaceId,
        terminalId,
      });
      onWorkspacePress?.();
      router.navigate(
        buildHostWorkspaceRoute(terminalTarget.serverId, terminalTarget.workspaceId) as Href,
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t("workspace.terminal.unableToSubscribe"),
      );
    },
  });
  const handleTerminalPress = useCallback(() => {
    terminalMutation.mutate();
  }, [terminalMutation]);

  const handleRemoveProject = useCallback(() => {
    if (isRemovingProject) {
      return;
    }

    void (async () => {
      const confirmed = await confirmDialog({
        title: t("sidebar.project.confirmations.removeTitle"),
        message: t("sidebar.project.confirmations.removeMessage", { projectName: displayName }),
        confirmLabel: t("sidebar.project.confirmations.removeConfirm"),
        cancelLabel: t("sidebar.project.confirmations.cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      setIsRemovingProject(true);
      const readiness = getCurrentProjectRemoveReadiness({
        hosts: project.hosts,
      });
      if (readiness.kind === "needs_host_update") {
        toast.error(t("sidebar.project.toasts.updateHostToRemove"));
        setIsRemovingProject(false);
        return;
      }

      void removeProjectFromHosts({
        targets: readiness.targets,
        getClient: (serverId) => getHostRuntimeStore().getClient(serverId),
      })
        .then((outcome) => {
          if (outcome.kind === "host_disconnected") {
            toast.error(t("sidebar.project.toasts.hostDisconnected"));
            return null;
          }
          if (outcome.kind === "failed") {
            toast.error(t("sidebar.project.toasts.removeFailed"));
          }
          return null;
        })
        .catch((error) => {
          toast.error(
            error instanceof Error ? error.message : t("sidebar.project.toasts.removeFailed"),
          );
        })
        .finally(() => {
          setIsRemovingProject(false);
        });
    })();
  }, [isRemovingProject, displayName, t, toast, project.hosts]);

  const handleToggleCollapsed = useCallback(() => {
    onToggleCollapsed(project.viewKey);
  }, [onToggleCollapsed, project.viewKey]);

  // Bulk archive for the project's swept done workspaces. Risky worktrees still
  // get their per-workspace confirm dialog (selectProjectWorkspacesToArchive).
  const handleArchiveAllDone = useCallback(() => {
    const entries = workspaceSweep.done
      .map((workspace) => workspaceEntriesByKey.get(workspace.workspaceKey) ?? null)
      .filter((entry): entry is SidebarWorkspaceEntry => entry !== null);
    if (entries.length === 0) {
      return;
    }
    void (async () => {
      const targets = await selectProjectWorkspacesToArchive(entries);
      if (targets.length === 0) {
        return;
      }
      for (const target of targets) {
        redirectIfArchivingActiveWorkspace({ ...target, activeWorkspaceSelection });
      }
      const failures = await archiveWorkspacesOptimistically({
        getClient: (serverId) => getHostRuntimeStore().getClient(serverId),
        workspaces: targets,
      });
      if (failures.length > 0) {
        toast.error(t("sidebar.workspace.toasts.archiveFailed"));
      }
    })();
  }, [workspaceSweep.done, workspaceEntriesByKey, activeWorkspaceSelection, toast, t]);

  // Manual sweep override: flag every agent on every live workspace as done so
  // the whole project collapses behind the done toggle now, not after a day.
  const handleMarkAllDone = useCallback(() => {
    const sessionsSnapshot = useSessionStore.getState().sessions;
    for (const key of collectWorkspaceAgentDoneKeys(sessionsSnapshot, workspaceSweep.live)) {
      setManuallyDone(key, true);
    }
  }, [setManuallyDone, workspaceSweep.live]);

  let projectChildren = null;
  if (!collapsed) {
    if (project.workspaces.length > 0) {
      projectChildren = (
        <>
          <DraggableList
            testID={`sidebar-workspace-list-${project.viewKey}`}
            data={visibleWorkspaces}
            keyExtractor={workspaceKeyExtractor}
            renderItem={renderWorkspace}
            onDragEnd={handleWorkspaceDragEnd}
            extraData={activeWorkspaceSelectionKey(activeWorkspaceSelection)}
            scrollEnabled={false}
            useDragHandle
            nestable={useNestable}
            simultaneousGestureRef={parentGestureRef}
            gestureHostPresented={dragGestureHostPresented}
            containerStyle={styles.workspaceListContainer}
          />
          {canToggleWorkspaces ? (
            <SidebarGroupToggleRow
              expanded={workspacesExpanded}
              onPress={toggleWorkspacesExpanded}
              testID={`sidebar-project-show-more-${project.viewKey}`}
            />
          ) : null}
          {workspaceSweep.done.length > 0 ? (
            <>
              <SidebarDoneWorkspacesToggle
                count={workspaceSweep.done.length}
                expanded={doneExpanded}
                onPress={toggleDoneExpanded}
                onArchiveAll={handleArchiveAllDone}
                testID={`sidebar-done-workspaces-toggle-${project.viewKey}`}
              />
              {doneExpanded
                ? workspaceSweep.done.map((workspace) => (
                    <View key={workspace.workspaceKey}>{renderWorkspaceRow(workspace)}</View>
                  ))
                : null}
            </>
          ) : null}
        </>
      );
    } else if (rowModel.trailingAction.kind === "new_workspace") {
      projectChildren = (
        <NewWorkspaceGhostRow
          project={project}
          displayName={displayName}
          worktreeTarget={rowModel.trailingAction.target}
          onWorkspacePress={onWorkspacePress}
        />
      );
    }
  }

  return (
    <View role="group" accessibilityLabel={displayName} style={styles.projectBlock}>
      <ProjectHeaderRow
        project={project}
        displayName={displayName}
        iconDataUri={iconDataUri}
        // The status rollup pills below carry per-bucket counts for every row
        // (expanded or collapsed), so the collapsed-only aggregate dot is off.
        statusBucket={null}
        selected={false}
        chevron={rowModel.chevron}
        onPress={handleToggleCollapsed}
        worktreeTarget={
          rowModel.trailingAction.kind === "new_workspace" ? rowModel.trailingAction.target : null
        }
        terminalTarget={terminalTarget}
        terminalLoading={terminalMutation.isPending}
        onTerminalPress={handleTerminalPress}
        isProjectActive={active}
        onWorkspacePress={onWorkspacePress}
        onWorktreeCreated={onWorktreeCreated}
        drag={drag}
        isDragging={isDragging}
        isArchiving={isRemovingProject}
        menuController={null}
        onRemoveProject={handleRemoveProject}
        removeProjectStatus={isRemovingProject ? "pending" : "idle"}
        dragHandleProps={dragHandleProps}
        usage={projectUsage}
        statusRollup={statusRollup}
        statusRollupLiveCount={workspaceSweep.live.length}
        doneCount={workspaceSweep.done.length}
        doneExpanded={doneExpanded}
        onToggleDone={toggleDoneExpanded}
        onMarkAllDone={workspaceSweep.live.length > 0 ? handleMarkAllDone : undefined}
      />

      {projectChildren}
    </View>
  );
}

type ProjectBlockProps = Parameters<typeof ProjectBlock>[0];

// oxlint-disable-next-line complexity
function areProjectBlockPropsEqual(previous: ProjectBlockProps, next: ProjectBlockProps): boolean {
  return (
    previous.project === next.project &&
    previous.workspaceEntriesByKey === next.workspaceEntriesByKey &&
    previous.collapsed === next.collapsed &&
    previous.displayName === next.displayName &&
    previous.iconDataUri === next.iconDataUri &&
    previous.selectionEnabled === next.selectionEnabled &&
    previous.showShortcutBadges === next.showShortcutBadges &&
    previous.shortcutIndexByWorkspaceKey === next.shortcutIndexByWorkspaceKey &&
    previous.hostBadgeByServerId === next.hostBadgeByServerId &&
    previous.supportsMultiplicityByServerId === next.supportsMultiplicityByServerId &&
    previous.supportsPinningByServerId === next.supportsPinningByServerId &&
    previous.onToggleWorkspacePin === next.onToggleWorkspacePin &&
    previous.parentGestureRef === next.parentGestureRef &&
    previous.onToggleCollapsed === next.onToggleCollapsed &&
    previous.onWorkspacePress === next.onWorkspacePress &&
    previous.onWorkspaceReorder === next.onWorkspaceReorder &&
    previous.onWorktreeCreated === next.onWorktreeCreated &&
    previous.drag === next.drag &&
    previous.isDragging === next.isDragging &&
    previous.dragHandleProps === next.dragHandleProps &&
    previous.useNestable === next.useNestable &&
    previous.dragGestureHostPresented === next.dragGestureHostPresented &&
    previous.creatingWorkspaceIds === next.creatingWorkspaceIds &&
    areProjectBlockSelectionsEqual(previous, next)
  );
}

function areProjectBlockSelectionsEqual(
  previous: ProjectBlockProps,
  next: ProjectBlockProps,
): boolean {
  const previousActive = isProjectSelectedByRoute({
    selection: previous.activeWorkspaceSelection,
    project: previous.project,
    enabled: previous.selectionEnabled,
  });
  const nextActive = isProjectSelectedByRoute({
    selection: next.activeWorkspaceSelection,
    project: next.project,
    enabled: next.selectionEnabled,
  });
  if (previousActive !== nextActive) {
    return false;
  }
  if (!previousActive) {
    return true;
  }
  return (
    activeWorkspaceSelectionKey(previous.activeWorkspaceSelection) ===
    activeWorkspaceSelectionKey(next.activeWorkspaceSelection)
  );
}

const MemoProjectBlock = memo(ProjectBlock, areProjectBlockPropsEqual);

export function SidebarWorkspaceList({
  statusGroups,
  pinnedGroups,
  projects,
  workspaceEntriesByKey,
  collapsedProjectKeys,
  onToggleProjectCollapsed,
  shortcutIndexByWorkspaceKey,
  groupMode,
  isRefreshing: _isRefreshing = false,
  onRefresh: _onRefresh,
  onWorkspacePress,
  onAddProject,
  listFooterComponent,
  listHeaderComponent,
  parentGestureRef,
  dragGestureHostPresented,
}: SidebarWorkspaceListProps) {
  const pathname = usePathname();
  const hosts = useHosts();
  const rowItems = useSidebarRowItems();
  // Host badge visibility is a lattice, not three competing switches: this gate is the global
  // "off", `shouldShowSidebarHostLabels` is the automatic "there is only one host so it says
  // nothing", and each host's own `badgeDisplay` decides name vs icon vs hidden. Turning the
  // item off here removes the badge everywhere; leaving it on defers to the per-host setting.
  const hostBadgeByServerId = useHostBadges({
    enabled: rowItems.host && shouldShowSidebarHostLabels(projects),
  });
  const serverIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const supportsMultiplicityByServerId = useHostFeatureMap(serverIds, "workspaceMultiplicity");
  const supportsPinningByServerId = useHostFeatureMap(serverIds, "workspacePinning");
  const onToggleWorkspacePin = useSidebarWorkspacePinController();
  // Status mode drops the project grouping, so its rows carry their own project
  // icon. Project mode fetches the same icons inside ProjectModeList for its
  // project headers, so only the active mode requests them.
  const statusProjectIconTargets = useMemo(
    () => (groupMode === "status" ? resolveSidebarProjectIconTargets(projects) : []),
    [groupMode, projects],
  );
  const statusProjectIconByProjectViewKey = useProjectIcons({
    projects: statusProjectIconTargets,
  });

  const content =
    groupMode === "status" ? (
      <SidebarStatusModeWrapper
        statusGroups={statusGroups}
        pinnedGroups={pinnedGroups}
        workspaceEntriesByKey={workspaceEntriesByKey}
        projectIconByProjectViewKey={statusProjectIconByProjectViewKey}
        shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
        onWorkspacePress={onWorkspacePress}
        hostBadgeByServerId={hostBadgeByServerId}
        supportsPinningByServerId={supportsPinningByServerId}
        onToggleWorkspacePin={onToggleWorkspacePin}
        listHeaderComponent={listHeaderComponent}
      />
    ) : (
      <ProjectModeList
        projects={projects}
        pinnedGroups={pinnedGroups}
        workspaceEntriesByKey={workspaceEntriesByKey}
        collapsedProjectKeys={collapsedProjectKeys}
        onToggleProjectCollapsed={onToggleProjectCollapsed}
        shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
        onWorkspacePress={onWorkspacePress}
        onAddProject={onAddProject}
        listFooterComponent={listFooterComponent}
        listHeaderComponent={listHeaderComponent}
        parentGestureRef={parentGestureRef}
        dragGestureHostPresented={dragGestureHostPresented}
        pathname={pathname}
        hostBadgeByServerId={hostBadgeByServerId}
        supportsMultiplicityByServerId={supportsMultiplicityByServerId}
        supportsPinningByServerId={supportsPinningByServerId}
        onToggleWorkspacePin={onToggleWorkspacePin}
      />
    );

  return content;
}

function SidebarStatusModeWrapper({
  statusGroups,
  pinnedGroups,
  workspaceEntriesByKey,
  projectIconByProjectViewKey,
  shortcutIndexByWorkspaceKey: _projectShortcutIndex,
  onWorkspacePress,
  hostBadgeByServerId,
  supportsPinningByServerId,
  onToggleWorkspacePin,
  listHeaderComponent,
}: {
  statusGroups: StatusGroup[];
  pinnedGroups: PinnedSidebarGroups;
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  projectIconByProjectViewKey: ReadonlyMap<string, string | null>;
  shortcutIndexByWorkspaceKey: Map<string, number>;
  onWorkspacePress?: () => void;
  hostBadgeByServerId: ReadonlyMap<string, HostBadgeModel>;
  supportsPinningByServerId: ReadonlyMap<string, boolean>;
  onToggleWorkspacePin: ToggleSidebarWorkspacePin;
  listHeaderComponent?: ReactElement | null;
}) {
  const showShortcutBadges = useShowShortcutBadges();

  return (
    <SidebarStatusWorkspaceList
      groups={statusGroups}
      pinnedWorkspaces={pinnedGroups.pinnedChats.flatMap((workspace) => {
        const entry = workspaceEntriesByKey.get(workspace.workspaceKey);
        return entry ? [entry] : [];
      })}
      projectIconByProjectViewKey={projectIconByProjectViewKey}
      shortcutIndexByWorkspaceKey={_projectShortcutIndex}
      showShortcutBadges={showShortcutBadges}
      onWorkspacePress={onWorkspacePress}
      hostBadgeByServerId={hostBadgeByServerId}
      supportsPinningByServerId={supportsPinningByServerId}
      onToggleWorkspacePin={onToggleWorkspacePin}
      listHeaderComponent={listHeaderComponent}
    />
  );
}

function ProjectModeList({
  projects,
  pinnedGroups,
  workspaceEntriesByKey,
  collapsedProjectKeys,
  onToggleProjectCollapsed,
  shortcutIndexByWorkspaceKey,
  onWorkspacePress,
  onAddProject,
  listFooterComponent,
  listHeaderComponent,
  parentGestureRef,
  dragGestureHostPresented,
  pathname,
  hostBadgeByServerId,
  supportsMultiplicityByServerId,
  supportsPinningByServerId,
  onToggleWorkspacePin,
}: Omit<SidebarWorkspaceListProps, "statusGroups" | "groupMode" | "isRefreshing" | "onRefresh"> & {
  pathname: string;
  hostBadgeByServerId: ReadonlyMap<string, HostBadgeModel>;
  supportsMultiplicityByServerId: ReadonlyMap<string, boolean>;
  supportsPinningByServerId: ReadonlyMap<string, boolean>;
  onToggleWorkspacePin: ToggleSidebarWorkspacePin;
}) {
  const hasActiveHostFilter = useSidebarViewStore((state) => state.hostFilters.length > 0);
  const { t } = useTranslation();
  const [creatingWorkspaceIds, setCreatingWorkspaceIds] = useState<Set<string>>(() => new Set());
  const creatingWorkspaceTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const showShortcutBadges = useShowShortcutBadges();
  const pinnedCollapsed = useSidebarCollapsedSectionsStore((state) => state.collapsedPinned);
  const togglePinnedCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.togglePinnedCollapsed,
  );

  const getProjectOrder = useSidebarOrderStore((state) => state.getProjectOrder);
  const setProjectOrder = useSidebarOrderStore((state) => state.setProjectOrder);
  const getWorkspaceOrder = useSidebarOrderStore((state) => state.getWorkspaceOrder);
  const setWorkspaceOrder = useSidebarOrderStore((state) => state.setWorkspaceOrder);

  const isWorkspaceRoute = useMemo(
    () => Boolean(pathname && parseHostWorkspaceRouteFromPathname(pathname)),
    [pathname],
  );
  const selectionEnabled = isWorkspaceRoute;
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const { pinnedChats, unpinnedProjects } = pinnedGroups;
  const {
    visibleItems: visiblePinnedChats,
    expanded: pinnedChatsExpanded,
    canToggle: canTogglePinnedChats,
    toggleExpanded: togglePinnedChatsExpanded,
  } = useLimitedSidebarGroup(pinnedChats);
  const projectIconTargets = useMemo(() => resolveSidebarProjectIconTargets(projects), [projects]);
  const nativeScrollGestureProps = useMemo(
    () =>
      parentGestureRef
        ? ({
            // NestableScrollContainer forwards props to RNGH ScrollView. Keep
            // vertical scroll and sidebar close pan simultaneous: vertical
            // intent scrolls immediately, clear horizontal intent can still
            // activate close from inside the list.
            simultaneousHandlers: parentGestureRef,
          } as object)
        : undefined,
    [parentGestureRef],
  );

  const projectIconByProjectViewKey = useProjectIcons({
    projects: projectIconTargets,
  });

  useEffect(() => {
    const timeouts = creatingWorkspaceTimeoutsRef.current;
    return () => {
      for (const timeout of timeouts.values()) {
        clearTimeout(timeout);
      }
      timeouts.clear();
    };
  }, []);

  useEffect(() => {
    if (creatingWorkspaceIds.size === 0) {
      return;
    }

    const visibleWorkspaceIds = new Set<string>();
    for (const project of projects) {
      for (const workspace of project.workspaces) {
        visibleWorkspaceIds.add(workspace.workspaceId);
      }
    }

    const removedWorkspaceIds = Array.from(creatingWorkspaceIds).filter(
      (workspaceId) => !visibleWorkspaceIds.has(workspaceId),
    );
    if (removedWorkspaceIds.length === 0) {
      return;
    }

    for (const workspaceId of removedWorkspaceIds) {
      const timeout = creatingWorkspaceTimeoutsRef.current.get(workspaceId);
      if (timeout) {
        clearTimeout(timeout);
        creatingWorkspaceTimeoutsRef.current.delete(workspaceId);
      }
    }

    setCreatingWorkspaceIds((current) => {
      const next = new Set(current);
      for (const workspaceId of removedWorkspaceIds) {
        next.delete(workspaceId);
      }
      return next;
    });
  }, [creatingWorkspaceIds, projects]);

  const handleProjectDragEnd = useCallback(
    (reorderedProjects: SidebarProjectEntry[]) => {
      const reorderedProjectKeys = reorderedProjects.map((project) => project.viewKey);
      const currentProjectOrder = getProjectOrder();
      if (
        !hasVisibleOrderChanged({
          currentOrder: currentProjectOrder,
          reorderedVisibleKeys: reorderedProjectKeys,
        })
      ) {
        return;
      }

      setProjectOrder(
        mergeWithRemainder({
          currentOrder: currentProjectOrder,
          reorderedVisibleKeys: reorderedProjectKeys,
        }),
      );
    },
    [getProjectOrder, setProjectOrder],
  );

  const handleWorkspaceReorder = useCallback(
    (projectViewKey: string, reorderedWorkspaces: SidebarWorkspacePlacement[]) => {
      const reorderedWorkspaceKeys = reorderedWorkspaces.map((workspace) => workspace.workspaceKey);
      const currentWorkspaceOrder = getWorkspaceOrder(projectViewKey);
      if (
        !hasVisibleOrderChanged({
          currentOrder: currentWorkspaceOrder,
          reorderedVisibleKeys: reorderedWorkspaceKeys,
        })
      ) {
        return;
      }

      setWorkspaceOrder(
        projectViewKey,
        mergeWithRemainder({
          currentOrder: currentWorkspaceOrder,
          reorderedVisibleKeys: reorderedWorkspaceKeys,
        }),
      );
    },
    [getWorkspaceOrder, setWorkspaceOrder],
  );

  const handleWorktreeCreated = useCallback((workspaceId: string) => {
    setCreatingWorkspaceIds((current) => {
      const next = new Set(current);
      next.add(workspaceId);
      return next;
    });
    const existingTimeout = creatingWorkspaceTimeoutsRef.current.get(workspaceId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    creatingWorkspaceTimeoutsRef.current.set(
      workspaceId,
      setTimeout(() => {
        creatingWorkspaceTimeoutsRef.current.delete(workspaceId);
        setCreatingWorkspaceIds((current) => {
          if (!current.has(workspaceId)) {
            return current;
          }
          const next = new Set(current);
          next.delete(workspaceId);
          return next;
        });
      }, 3000),
    );
  }, []);

  const renderProjectBlock = useCallback(
    (
      item: SidebarProjectEntry,
      dragState: {
        drag: () => void;
        isDragging: boolean;
        dragHandleProps?: DraggableRenderItemInfo<SidebarProjectEntry>["dragHandleProps"];
      },
    ) => {
      return (
        <MemoProjectBlock
          key={item.viewKey}
          project={item}
          workspaceEntriesByKey={workspaceEntriesByKey}
          collapsed={collapsedProjectKeys.has(item.viewKey)}
          displayName={item.projectName}
          iconDataUri={projectIconByProjectViewKey.get(item.viewKey) ?? null}
          selectionEnabled={selectionEnabled}
          showShortcutBadges={showShortcutBadges}
          shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
          parentGestureRef={parentGestureRef}
          onToggleCollapsed={onToggleProjectCollapsed}
          onWorkspacePress={onWorkspacePress}
          onWorkspaceReorder={handleWorkspaceReorder}
          onWorktreeCreated={handleWorktreeCreated}
          drag={dragState.drag}
          isDragging={dragState.isDragging}
          dragHandleProps={dragState.dragHandleProps}
          useNestable={platformIsNative}
          dragGestureHostPresented={dragGestureHostPresented}
          creatingWorkspaceIds={creatingWorkspaceIds}
          activeWorkspaceSelection={activeWorkspaceSelection}
          hostBadgeByServerId={hostBadgeByServerId}
          supportsMultiplicityByServerId={supportsMultiplicityByServerId}
          supportsPinningByServerId={supportsPinningByServerId}
          onToggleWorkspacePin={onToggleWorkspacePin}
        />
      );
    },
    [
      collapsedProjectKeys,
      activeWorkspaceSelection,
      handleWorktreeCreated,
      handleWorkspaceReorder,
      hostBadgeByServerId,
      supportsMultiplicityByServerId,
      supportsPinningByServerId,
      onToggleWorkspacePin,
      onWorkspacePress,
      onToggleProjectCollapsed,
      parentGestureRef,
      dragGestureHostPresented,
      projectIconByProjectViewKey,
      selectionEnabled,
      shortcutIndexByWorkspaceKey,
      showShortcutBadges,
      workspaceEntriesByKey,
      creatingWorkspaceIds,
    ],
  );

  const renderProject = useCallback(
    ({ item, drag, isActive, dragHandleProps }: DraggableRenderItemInfo<SidebarProjectEntry>) =>
      renderProjectBlock(item, { drag, isDragging: isActive, dragHandleProps }),
    [renderProjectBlock],
  );

  const renderPinnedChat = useCallback(
    (workspace: SidebarWorkspacePlacement) => {
      return (
        <MemoWorkspaceRowItem
          key={workspace.workspaceKey}
          workspace={workspace}
          workspaceEntry={workspaceEntriesByKey.get(workspace.workspaceKey) ?? null}
          hostBadge={hostBadgeByServerId.get(workspace.serverId) ?? null}
          leadingProjectName={workspace.projectName}
          leadingProjectIconDataUri={
            projectIconByProjectViewKey.get(workspace.projectViewKey) ?? null
          }
          shortcutNumber={shortcutIndexByWorkspaceKey.get(workspace.workspaceKey) ?? null}
          showShortcutBadge={showShortcutBadges}
          canCopyBranchName={workspace.projectKind === "git"}
          canPin={supportsPinningByServerId.get(workspace.serverId) === true}
          onToggleWorkspacePin={onToggleWorkspacePin}
          isCreating={creatingWorkspaceIds.has(workspace.workspaceId)}
          selectionEnabled={selectionEnabled}
          activeWorkspaceSelection={activeWorkspaceSelection}
          onWorkspacePress={onWorkspacePress}
        />
      );
    },
    [
      activeWorkspaceSelection,
      creatingWorkspaceIds,
      hostBadgeByServerId,
      onWorkspacePress,
      selectionEnabled,
      shortcutIndexByWorkspaceKey,
      showShortcutBadges,
      supportsPinningByServerId,
      onToggleWorkspacePin,
      projectIconByProjectViewKey,
      workspaceEntriesByKey,
    ],
  );

  const content = (
    <>
      {pinnedChats.length > 0 ? (
        <View style={styles.pinnedSection} testID="sidebar-pinned-section">
          <PinnedSectionHeader collapsed={pinnedCollapsed} onToggle={togglePinnedCollapsed} />
          {pinnedCollapsed ? null : (
            <>
              {visiblePinnedChats.map(renderPinnedChat)}
              {canTogglePinnedChats ? (
                <SidebarGroupToggleRow
                  expanded={pinnedChatsExpanded}
                  onPress={togglePinnedChatsExpanded}
                  testID="sidebar-pinned-show-more"
                />
              ) : null}
            </>
          )}
        </View>
      ) : null}
      {unpinnedProjects.length > 0 || hasActiveHostFilter ? listHeaderComponent : null}
      {projects.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle} testID="sidebar-project-empty-state">
            {t("sidebar.project.empty.title")}
          </Text>
          <Text style={styles.emptyText}>{t("sidebar.project.empty.description")}</Text>
          <Button variant="ghost" size="sm" leftIcon={Plus} onPress={onAddProject}>
            {t("sidebar.actions.addProject")}
          </Button>
        </View>
      ) : (
        <DraggableList
          testID="sidebar-project-list"
          data={unpinnedProjects}
          keyExtractor={projectViewKeyExtractor}
          renderItem={renderProject}
          onDragEnd={handleProjectDragEnd}
          extraData={activeWorkspaceSelectionKey(activeWorkspaceSelection)}
          scrollEnabled={false}
          useDragHandle
          nestable={platformIsNative}
          simultaneousGestureRef={parentGestureRef}
          gestureHostPresented={dragGestureHostPresented}
          containerStyle={styles.projectListContainer}
        />
      )}
      {listFooterComponent}
    </>
  );

  return (
    <View style={styles.container}>
      {platformIsNative ? (
        <NestableScrollContainer
          {...nativeScrollGestureProps}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          testID="sidebar-project-workspace-list-scroll"
        >
          {content}
        </NestableScrollContainer>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          testID="sidebar-project-workspace-list-scroll"
        >
          {content}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.spacing[2],
    // Optical inset: aligns the visible Pinned/Workspaces glyph edge with the
    // Schedules icon across the divider; their layout boxes have different insets.
    paddingTop: 2,
    paddingBottom: theme.spacing[4],
  },
  projectListContainer: {
    width: "100%",
  },
  pinnedSection: {
    marginBottom: theme.spacing[1],
  },
  projectBlock: {
    marginBottom: theme.spacing[1],
  },
  workspaceListContainer: {},
  newWorkspaceGhostRow: {
    minHeight: 32,
    marginLeft: theme.spacing[6],
    marginRight: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    userSelect: "none",
  },
  newWorkspaceGhostRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  newWorkspaceGhostIconSlot: {
    width: theme.iconSize.sm,
    height: theme.iconSize.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  newWorkspaceGhostText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    minWidth: 0,
    flexShrink: 1,
  },
  newWorkspaceGhostTextHovered: {
    fontSize: theme.fontSize.sm,
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foreground,
  },
  emptyContainer: {
    marginHorizontal: theme.spacing[2],
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[6],
    paddingBottom: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    alignItems: "center",
    gap: theme.spacing[3],
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    textAlign: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  projectRow: {
    position: "relative",
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[1],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    userSelect: "none",
  },
  projectRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  projectRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  projectRowDragging: {
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ scale: 1.02 }],
    zIndex: 3,
    ...theme.shadow.md,
  },
  projectRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  projectTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
  },
  projectTitleGroupStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 0,
  },
  projectUsageRow: {
    minWidth: 0,
    flexShrink: 1,
  },
  projectTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: "400",
    minWidth: 0,
    flexShrink: 1,
  },
  projectActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    flexShrink: 0,
  },
  projectActionButtonHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  projectActionButtonText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  projectIconActionButton: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  projectIconActionButtonHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  projectIconActionButtonHidden: {
    opacity: 0,
  },
  projectTrailingActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
    // MoreVertical paints only around the center of its 14px SVG. Keep the 24px controls,
    // but pull their painted edge through the unused view-box space onto the row rail.
    marginRight: -6,
  },
  projectKebabButton: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  projectKebabButtonHidden: {
    opacity: 0,
  },
  projectKebabButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  projectStatusRollup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  projectActiveCountBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: theme.spacing[1],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    flexShrink: 0,
  },
  projectActiveCountBadgeText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 14,
  },
  projectTrailingControlSlot: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  projectActionTooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  projectActionTooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  projectActionTooltipShortcut: {},
  projectShortcutBadgeOverlay: {
    position: "absolute",
    top: theme.spacing[2] + 1,
    right: theme.spacing[2],
  },
  workspaceRow: {
    minHeight: 36,
    marginBottom: theme.spacing[1],
    paddingVertical: theme.spacing[2],
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "center",
    gap: theme.spacing[1],
    userSelect: "none",
  },
  workspaceRowMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    width: "100%",
  },
  workspaceRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  workspaceRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  workspaceRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  workspaceRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  workspaceRowDragging: {
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ scale: 1.02 }],
    zIndex: 3,
    ...theme.shadow.md,
  },
  sidebarRowSelected: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  workspaceRowContainer: {
    position: "relative",
  },
  workspaceStatusDot: {
    position: "relative",
    width: WORKSPACE_STATUS_DOT_WIDTH,
    height: 16,
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceArchivingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: `${theme.colors.surface0}cc`,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
    zIndex: 1,
  },
  workspaceArchivingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
  },
  workspaceBranchText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: "400",
    lineHeight: 20,
    opacity: 0.76,
    flex: 1,
    minWidth: 0,
  },
  workspaceBranchTextCreating: {
    opacity: 0.92,
  },
  workspaceBranchTextHovered: {
    opacity: 1,
  },
  workspacePrBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingLeft: WORKSPACE_STATUS_DOT_WIDTH + theme.spacing[2],
  },
  workspaceCreatingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    flexShrink: 0,
  },
  kebabButton: {
    padding: 2,
    borderRadius: 4,
    marginLeft: 2,
  },
  kebabButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
}));
