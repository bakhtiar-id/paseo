import { memo, useCallback, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useShallow } from "zustand/shallow";
import {
  Archive,
  Brain,
  Circle,
  CircleAlert,
  CircleCheck,
  Clock,
  CircleDot,
  CircleX,
  MoreVertical,
} from "lucide-react-native";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { deriveSidebarStateBucket, type SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { STATUS_BUCKET_ORDER, useStatusBucketLabels } from "@/hooks/sidebar-status-view-model";
import { getProviderIcon, type ProviderIconProps } from "@/components/provider-icons";
import { MODE_ICONS } from "@/agent-controls/icons";
import { formatAgentModeLabel, formatThinkingOptionLabel } from "@/agent-controls/labels";
import { shortModelLabel } from "@/composer/agent-controls/model-sheet";
import { formatTimeAgo } from "@/utils/time";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { formatDuration } from "@/utils/time";
import { baseColors, type Theme } from "@/styles/theme";
import { PulsingHalo } from "@/components/ui/pulsing-dot";
import { SyncedLoader } from "@/components/synced-loader";
import { useLimitedSidebarGroup } from "@/components/sidebar/use-limited-sidebar-group";
import { SidebarGroupToggleRow } from "@/components/sidebar/sidebar-group-toggle-row";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { confirmDialog } from "@/utils/confirm-dialog";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { isNative as platformIsNative } from "@/constants/platform";
import { agentDoneKey, useAgentDoneStore } from "@/stores/agent-done-store";
import { agentContextPercent, contextUsageTier } from "@/components/sidebar/sidebar-context-usage";
import { useLiveAgentUsage, UsageSubtitle } from "@/components/sidebar/sidebar-usage-strip";
import { useProviderSubagentsForParent, type ProviderSubagentRow } from "@/subagents/select";
import {
  buildSubagentRowPresentationData,
  splitSubagentTypeSuffix,
} from "@/subagents/track-presentation";
import { useCompactTimeAgo } from "@/hooks/use-compact-time-ago";

const AGENT_ROW_CAP = 4;
const EMPTY_AGENTS: Agent[] = [];

const foregroundMutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

// Provider and mode icons vary per row, so they can't be wrapped at module
// scope like the usual ThemedX constants — cache one wrapper per component.
type ThemedIconComponent = ComponentType<{
  size?: number;
  uniProps?: (theme: Theme) => Record<string, unknown>;
}>;

const themedIconCache = new Map<ComponentType<unknown>, ThemedIconComponent>();

function themedIcon<Props extends { size?: number }>(
  Icon: ComponentType<Props>,
): ThemedIconComponent {
  let wrapped = themedIconCache.get(Icon as ComponentType<unknown>);
  if (!wrapped) {
    wrapped = withUnistyles(
      Icon as unknown as ComponentType<{ size?: number; color?: string }>,
    ) as unknown as ThemedIconComponent;
    themedIconCache.set(Icon as ComponentType<unknown>, wrapped);
  }
  return wrapped;
}

const ThemedMoreVertical = withUnistyles(MoreVertical);
const ThemedArchive = withUnistyles(Archive);
const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedBrain = withUnistyles(Brain);
const ThemedCircleAlert = withUnistyles(CircleAlert);
const ThemedCircleX = withUnistyles(CircleX);
const ThemedCircleDot = withUnistyles(CircleDot);
const ThemedCircle = withUnistyles(Circle);
const ThemedSyncedLoader = withUnistyles(SyncedLoader);
const ThemedClock = withUnistyles(Clock);
const amberIconMapping = () => ({ color: baseColors.amber[500] });
const redIconMapping = () => ({ color: baseColors.red[500] });
const greenIconMapping = () => ({ color: baseColors.green[500] });
const runningIconMapping = () => ({ color: baseColors.blue[500] });
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundExtraMuted });

// Kept out of JSX: the menu trigger nests inside pressable rows, so the press
// must not bubble up and trigger the row navigation as well.
function stopRowPressPropagation(event: { stopPropagation?: () => void }) {
  event.stopPropagation?.();
}

function useWorkspaceAgents(serverId: string, workspaceId: string): Agent[] {
  return useSessionStore(
    useShallow((state) => {
      const agents = state.sessions[serverId]?.agents;
      if (!agents) {
        return EMPTY_AGENTS;
      }
      const matched: Agent[] = [];
      for (const agent of agents.values()) {
        if (agent.workspaceId !== workspaceId || agent.archivedAt) {
          continue;
        }
        matched.push(agent);
      }
      return matched;
    }),
  );
}

function bucketOf(agent: Agent): SidebarStateBucket {
  return deriveSidebarStateBucket({
    status: agent.status,
    pendingPermissionCount: agent.pendingPermissions.length,
    requiresAttention: agent.requiresAttention,
    attentionReason: agent.attentionReason,
  });
}

function sortAgents(agents: readonly Agent[]): Agent[] {
  const priorityByBucket = new Map(STATUS_BUCKET_ORDER.map((bucket, index) => [bucket, index]));
  return [...agents].sort((a, b) => {
    const bucketA = bucketOf(a);
    const bucketB = bucketOf(b);
    const priorityDiff =
      (priorityByBucket.get(bucketA) ?? STATUS_BUCKET_ORDER.length) -
      (priorityByBucket.get(bucketB) ?? STATUS_BUCKET_ORDER.length);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return b.lastActivityAt.getTime() - a.lastActivityAt.getTime();
  });
}

type ModeTierStyle = "safe" | "moderate" | "planning" | "dangerous";

function resolveModeTierStyle(colorTier: string | undefined): ModeTierStyle {
  if (colorTier === "safe" || colorTier === "planning" || colorTier === "dangerous") {
    return colorTier;
  }
  return "moderate";
}

function modeTierTextStyle(modeTier: ModeTierStyle) {
  switch (modeTier) {
    case "safe":
      return styles.agentModeSafe;
    case "planning":
      return styles.agentModePlanning;
    case "dangerous":
      return styles.agentModeDangerous;
    default:
      return styles.agentModeModerate;
  }
}

// Status is icon-only (spec pass: words + elapsed cluttered the row). The word
// stays in the row's accessibilityLabel.
export function AgentStatusIcon({ bucket }: { bucket: SidebarStateBucket }) {
  switch (bucket) {
    case "needs_input":
      return <ThemedCircleAlert size={12} uniProps={amberIconMapping} />;
    case "failed":
      return <ThemedCircleX size={12} uniProps={redIconMapping} />;
    case "running":
      return <ThemedSyncedLoader size={11} uniProps={runningIconMapping} />;
    case "attention":
      return <ThemedCircleDot size={12} uniProps={greenIconMapping} />;
    case "done":
      return <ThemedCircle size={12} uniProps={mutedIconMapping} />;
    default:
      return null;
  }
}

const CONTEXT_TIER_FILL_STYLES = {
  low: "agentContextFillLow",
  medium: "agentContextFillMedium",
  high: "agentContextFillHigh",
  critical: "agentContextFillCritical",
} as const;

const CONTEXT_TIER_TEXT_STYLES = {
  low: "agentContextLow",
  medium: "agentContextMedium",
  high: "agentContextHigh",
  critical: "agentContextCritical",
} as const;

export function AgentContextBar({ percent }: { percent: number }) {
  const tier = contextUsageTier(percent);
  return (
    <View style={styles.agentContextGauge}>
      <View style={styles.agentContextTrack}>
        <View
          style={[
            styles.agentContextFill,
            styles[CONTEXT_TIER_FILL_STYLES[tier]],
            // Always leave a sliver visible so an active-but-tiny context still reads as a bar.
            { width: `${Math.max(4, percent)}%` },
          ]}
        />
      </View>
      <Text
        style={[styles.agentContextPercent, styles[CONTEXT_TIER_TEXT_STYLES[tier]]]}
        numberOfLines={1}
      >
        {`${percent}%`}
      </Text>
    </View>
  );
}

export function AgentRowMetaLine({
  modelLabel,
  modeLabel,
  modeTier,
  modeIcon,
  thinkingLabel,
  contextLabel,
  contextPercent,
}: {
  modelLabel: string | null;
  modeLabel: string | null;
  modeTier: ModeTierStyle;
  modeIcon: ReactNode;
  thinkingLabel: string | null;
  contextLabel?: string | null;
  contextPercent?: number | null;
}) {
  if (!modelLabel && !modeLabel && !thinkingLabel && !contextLabel && contextPercent === null) {
    return null;
  }
  return (
    <View style={styles.agentMetaLine}>
      {modelLabel ? (
        <Text style={styles.agentModel} numberOfLines={1}>
          {modelLabel}
        </Text>
      ) : null}
      {modeLabel ? (
        <>
          {modelLabel ? <Text style={styles.agentMetaSeparator}>·</Text> : null}
          <View style={[styles.agentMode, modeTier === "dangerous" && styles.agentModeChip]}>
            {modeIcon}
            <Text style={[styles.agentModeLabel, modeTierTextStyle(modeTier)]} numberOfLines={1}>
              {modeLabel}
            </Text>
          </View>
        </>
      ) : null}
      {thinkingLabel ? (
        <>
          {modelLabel || modeLabel ? <Text style={styles.agentMetaSeparator}>·</Text> : null}
          <View style={styles.agentThinking}>
            <ThemedBrain size={10} uniProps={foregroundMutedIconMapping} />
            <Text style={styles.agentThinkingLabel} numberOfLines={1}>
              {thinkingLabel}
            </Text>
          </View>
        </>
      ) : null}
      {contextLabel ? (
        <>
          {modelLabel || modeLabel || thinkingLabel ? (
            <Text style={styles.agentMetaSeparator}>·</Text>
          ) : null}
          <Text style={styles.agentContextLabel} numberOfLines={1}>
            {contextLabel}
          </Text>
        </>
      ) : null}
      {typeof contextPercent === "number" ? (
        <View style={styles.agentContextSlot}>
          <AgentContextBar percent={contextPercent} />
        </View>
      ) : null}
    </View>
  );
}

function AgentRowMenu({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const { archiveAgent } = useArchiveAgent();
  const doneKey = agentDoneKey(agent.serverId, agent.id);
  const isManuallyDone = useAgentDoneStore((state) => state.manuallyDoneAgentKeys.has(doneKey));
  const setManuallyDone = useAgentDoneStore((state) => state.setManuallyDone);
  const handleToggleDone = useCallback(() => {
    setManuallyDone(doneKey, !isManuallyDone);
  }, [setManuallyDone, doneKey, isManuallyDone]);
  const handleArchive = useCallback(() => {
    void (async () => {
      if (agent.status === "running") {
        const confirmed = await confirmDialog({
          title: t("workspace.tabs.confirmations.archiveRunningAgentTitle"),
          message: t("workspace.tabs.confirmations.archiveRunningAgentMessage"),
          confirmLabel: t("workspace.tabs.confirmations.archive"),
          cancelLabel: t("workspace.tabs.confirmations.cancel"),
          destructive: true,
        });
        if (!confirmed) {
          return;
        }
      }
      void archiveAgent({ serverId: agent.serverId, agentId: agent.id }).catch(() => {});
    })();
  }, [agent.serverId, agent.id, agent.status, archiveAgent, t]);
  const triggerStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.rowMenuTrigger,
      (Boolean(hovered) || pressed) && styles.rowMenuTriggerActive,
    ],
    [],
  );
  const archiveIcon = useMemo(
    () => <ThemedArchive size={14} uniProps={foregroundMutedIconMapping} />,
    [],
  );
  const doneIcon = useMemo(
    () => <ThemedCircleCheck size={14} uniProps={foregroundMutedIconMapping} />,
    [],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        testID={`sidebar-agent-actions-${agent.serverId}-${agent.id}`}
        accessibilityLabel={t("sidebar.agents.menu")}
        hitSlop={8}
        onPressIn={stopRowPressPropagation}
        style={triggerStyle}
      >
        <ThemedMoreVertical size={14} uniProps={foregroundMutedIconMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={200}>
        {agent.status !== "running" ? (
          <DropdownMenuItem leading={doneIcon} onSelect={handleToggleDone}>
            {t(isManuallyDone ? "sidebar.agents.unmarkDone" : "sidebar.agents.markDone")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem leading={archiveIcon} onSelect={handleArchive}>
          {t("sidebar.agents.archive")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const SidebarAgentRow = memo(function SidebarAgentRow({
  agent,
  onWorkspacePress,
}: {
  agent: Agent;
  onWorkspacePress?: () => void;
}) {
  const { t } = useTranslation();
  const statusBucketLabels = useStatusBucketLabels();
  const bucket: SidebarStateBucket = bucketOf(agent);
  const statusLabel = statusBucketLabels[bucket];
  const elapsed = formatTimeAgo(agent.lastActivityAt);
  const title = agent.title?.trim() || t("agentList.fallbackTitle");

  const mode = agent.currentModeId
    ? (agent.availableModes.find((entry) => entry.id === agent.currentModeId) ?? null)
    : null;
  const modeLabel = mode ? formatAgentModeLabel(mode) : null;
  const modeTier = resolveModeTierStyle(mode?.colorTier);
  const ModeIcon = mode?.icon ? (MODE_ICONS[mode.icon] ?? MODE_ICONS.Bot) : null;

  const thinkingId = agent.thinkingOptionId ?? null;
  const thinkingLabel =
    thinkingId && !["off", "none", "default"].includes(thinkingId.toLowerCase())
      ? formatThinkingOptionLabel({ id: thinkingId })
      : null;

  const modelLabel = agent.model ? shortModelLabel(agent.model) : null;
  const contextPercent = agentContextPercent(agent);
  const usage = useLiveAgentUsage(agent);

  const accessibilityLabel = [
    title,
    statusLabel,
    modeLabel,
    thinkingLabel,
    contextPercent === null ? null : t("contextWindow.used", { percentage: contextPercent }),
    elapsed,
  ]
    .filter(Boolean)
    .join(", ");

  const handlePress = useCallback(() => {
    onWorkspacePress?.();
    navigateToAgent({ serverId: agent.serverId, agentId: agent.id });
  }, [agent.serverId, agent.id, onWorkspacePress]);

  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.agentRow,
      (Boolean(hovered) || pressed) && styles.agentRowHovered,
    ],
    [],
  );
  // The ⋯ menu is an absolute overlay that fades in on hover — inserting it
  // into the row flow would shift the title/meta line and the context bar.
  // Touch platforms have no hover, so it stays visible there.
  const [isRowHovered, setIsRowHovered] = useState(false);
  const handleRowPointerEnter = useCallback(() => setIsRowHovered(true), []);
  const handleRowPointerLeave = useCallback(() => setIsRowHovered(false), []);
  const showMenu = isRowHovered || platformIsNative;

  const ProviderIcon = useMemo(() => themedIcon(getProviderIcon(agent.provider)), [agent.provider]);
  const modeIcon = useMemo(() => {
    if (!ModeIcon) {
      return null;
    }
    const ThemedModeIcon = themedIcon(ModeIcon as ComponentType<ProviderIconProps>);
    return <ThemedModeIcon size={10} uniProps={foregroundMutedIconMapping} />;
  }, [ModeIcon]);

  return (
    <View
      style={styles.agentRowWrap}
      onPointerEnter={handleRowPointerEnter}
      onPointerLeave={handleRowPointerLeave}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={handlePress}
        style={rowStyle}
        testID={`sidebar-agent-row-${agent.serverId}-${agent.id}`}
      >
        <View style={styles.providerGlyphSlot}>
          {bucket === "needs_input" ? (
            <PulsingHalo color={baseColors.amber[500]} size={14} />
          ) : null}
          <ProviderIcon size={14} uniProps={foregroundMutedIconMapping} />
        </View>
        <View style={styles.agentColumn}>
          <View style={styles.agentLine}>
            <Text style={styles.agentName} numberOfLines={1}>
              {title}
            </Text>
            <AgentStatusIcon bucket={bucket} />
          </View>
          <AgentRowMetaLine
            modelLabel={modelLabel}
            modeLabel={modeLabel}
            modeTier={modeTier}
            modeIcon={modeIcon}
            thinkingLabel={thinkingLabel}
            contextPercent={contextPercent}
          />
          {usage ? (
            <View style={styles.agentUsageLine}>
              <UsageSubtitle aggregate={usage} />
            </View>
          ) : null}
        </View>
      </Pressable>
      <View
        style={[styles.agentMenuOverlay, showMenu ? null : styles.agentMenuOverlayHidden]}
        pointerEvents={showMenu ? "auto" : "none"}
      >
        <AgentRowMenu agent={agent} />
      </View>
    </View>
  );
});

function ProviderSubagentRowView({
  serverId,
  row,
  onPress,
}: {
  serverId: string;
  row: ProviderSubagentRow;
  onPress: (subagentId: string) => void;
}) {
  const { t } = useTranslation();
  const presentation = useMemo(() => buildSubagentRowPresentationData(row), [row]);
  const ProviderIcon = useMemo(() => themedIcon(getProviderIcon(row.provider)), [row.provider]);
  const parsed = useMemo(() => splitSubagentTypeSuffix(row.title), [row.title]);

  // Total runtime: for a finished subagent, the run's wall-clock span is fixed at
  // completion (updatedAt - createdAt); for a running one, we tick elapsed.
  const isFinished = row.status !== "running";
  const totalElapsed = isFinished
    ? formatDuration(row.updatedAt.getTime() - row.createdAt.getTime())
    : "";
  const runningElapsed = useCompactTimeAgo(isFinished ? null : row.createdAt);

  // presentation.subtitle carries provider preformatted context when present
  // (which already includes the type for Claude), or the bare type when only a
  // title is known, or "" when nothing is.
  const contextLabel = presentation.subtitle || null;
  const descriptionLabel = row.description?.trim() || null;

  const label = descriptionLabel ?? parsed.task ?? contextLabel;
  const contextPart =
    // parsed.type only appears for OpenCode-style "(@type subagent)" titles —
    // Claude-style subtitles already embed the type, so don't double it.
    contextLabel ?? parsed.type;
  const timePart = isFinished ? totalElapsed : runningElapsed;

  const handlePress = useCallback(() => {
    onPress(row.id);
  }, [onPress, row.id]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label || t("agentList.fallbackTitle")}
      onPress={handlePress}
      testID={`sidebar-provider-subagent-row-${serverId}-${row.parentAgentId}-${row.id}`}
      style={styles.providerSubagentRow}
    >
      <View style={styles.providerSubagentGlyphSlot}>
        <ProviderIcon size={12} uniProps={foregroundMutedIconMapping} />
      </View>
      <View style={styles.providerSubagentColumn}>
        <View style={styles.agentLine}>
          <Text style={styles.providerSubagentName} numberOfLines={1}>
            {label}
          </Text>
          {presentation.statusBucket ? (
            <AgentStatusIcon bucket={presentation.statusBucket} />
          ) : null}
        </View>
        {contextPart || timePart ? (
          <View style={styles.providerSubagentSubline}>
            {contextPart ? (
              <Text style={styles.providerSubagentSubtitle} numberOfLines={1}>
                {contextPart}
              </Text>
            ) : null}
            {timePart ? (
              <View style={styles.providerSubagentTimeChip}>
                <ThemedClock size={9} uniProps={foregroundMutedIconMapping} />
                <Text style={styles.providerSubagentSubtitle} numberOfLines={1}>
                  {timePart}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function SidebarProviderSubagentRows({
  serverId,
  parentAgentId,
  onWorkspacePress,
}: {
  serverId: string;
  parentAgentId: string;
  onWorkspacePress?: () => void;
}) {
  const rows = useProviderSubagentsForParent({ serverId, parentAgentId });
  const handlePress = useCallback(
    (subagentId: string) => {
      onWorkspacePress?.();
      const workspaceId =
        useSessionStore.getState().sessions[serverId]?.agents.get(parentAgentId)?.workspaceId ??
        null;
      if (workspaceId) {
        navigateToWorkspace({
          serverId,
          workspaceId,
          target: { kind: "provider_subagent", parentAgentId, subagentId },
        });
        return;
      }
      navigateToAgent({ serverId, agentId: parentAgentId });
    },
    [onWorkspacePress, serverId, parentAgentId],
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <View style={styles.agentGroup} testID={`sidebar-subagent-group-${serverId}-${parentAgentId}`}>
      {rows.map((row) => (
        <ProviderSubagentRowView key={row.id} serverId={serverId} row={row} onPress={handlePress} />
      ))}
    </View>
  );
}

export function SidebarWorkspaceAgentRows({
  serverId,
  workspaceId,
  onWorkspacePress,
}: {
  serverId: string;
  workspaceId: string;
  onWorkspacePress?: () => void;
}) {
  const agents = useWorkspaceAgents(serverId, workspaceId);
  const sorted = useMemo(() => sortAgents(agents), [agents]);
  const { visibleItems, expanded, canToggle, toggleExpanded } = useLimitedSidebarGroup(
    sorted,
    AGENT_ROW_CAP,
  );

  if (sorted.length === 0) {
    return null;
  }

  return (
    <View style={styles.agentGroup}>
      {visibleItems.map((agent) => (
        <View key={`${serverId}:${agent.id}`}>
          <SidebarAgentRow agent={agent} onWorkspacePress={onWorkspacePress} />
          <SidebarProviderSubagentRows
            serverId={serverId}
            parentAgentId={agent.id}
            onWorkspacePress={onWorkspacePress}
          />
        </View>
      ))}
      {canToggle ? (
        <SidebarGroupToggleRow
          expanded={expanded}
          onPress={toggleExpanded}
          testID={`sidebar-agent-group-toggle-${serverId}-${workspaceId}`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  agentGroup: {
    // Thread line at the workspace kind icon's center (workspace row: 8 left
    // padding + half of the 16px icon slot), so spawned agents read as nested.
    marginLeft: theme.spacing[4],
    marginBottom: theme.spacing[1],
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.surface2,
  },
  agentRowWrap: {
    position: "relative",
  },
  agentRow: {
    position: "relative",
    minHeight: 34,
    marginLeft: theme.spacing[3] + 2,
    marginRight: theme.spacing[1],
    marginBottom: 1,
    paddingVertical: theme.spacing[1],
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[1.5],
    userSelect: "none",
  },
  agentRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  providerGlyphSlot: {
    position: "relative",
    width: theme.iconSize.sm,
    height: 15,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  agentColumn: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  agentLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  agentName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    lineHeight: 15,
    flex: 1,
    minWidth: 0,
  },
  agentMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    minWidth: 0,
  },
  agentUsageLine: {
    marginTop: 2,
    minWidth: 0,
  },
  providerSubagentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[1.5],
    marginLeft: theme.spacing[3] + 2,
    marginRight: theme.spacing[1],
    marginBottom: 1,
    paddingVertical: theme.spacing[1],
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    userSelect: "none",
  },
  providerSubagentGlyphSlot: {
    width: theme.iconSize.xs,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  providerSubagentColumn: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  providerSubagentName: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 14,
    flex: 1,
    minWidth: 0,
  },
  providerSubagentSubtitle: {
    color: theme.colors.foregroundExtraMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: 10,
    lineHeight: 13,
  },
  providerSubagentSubline: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    minWidth: 0,
  },
  providerSubagentTimeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1] / 2,
    flexShrink: 0,
  },
  agentModel: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: 10,
    lineHeight: 13,
    flexShrink: 1,
    minWidth: 0,
  },
  agentMetaSeparator: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: 10,
    lineHeight: 13,
  },
  agentMode: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  agentModeChip: {
    backgroundColor: `${theme.colors.palette.red[500]}26`,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[1],
    height: 14,
  },
  agentModeLabel: {
    fontSize: 10,
    lineHeight: 13,
  },
  agentModeSafe: {
    color: theme.colors.palette.green[500],
  },
  agentModeModerate: {
    color: theme.colors.foregroundMuted,
  },
  agentModePlanning: {
    color: theme.colors.palette.purple[600],
  },
  agentModeDangerous: {
    color: theme.colors.palette.red[500],
  },
  agentThinking: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  agentThinkingLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: 10,
    lineHeight: 13,
  },
  agentContextLabel: {
    color: theme.colors.foregroundExtraMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: 10,
    lineHeight: 13,
    flexShrink: 1,
    minWidth: 0,
  },
  // Context percent sits at the end of the meta line so eyes scan one column.
  agentContextSlot: {
    marginLeft: "auto",
    paddingLeft: theme.spacing[1],
    flexShrink: 0,
  },
  agentContextGauge: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  agentContextTrack: {
    width: 26,
    height: 3,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    overflow: "hidden",
  },
  agentContextFill: {
    height: "100%",
    borderRadius: theme.borderRadius.full,
  },
  agentContextFillLow: {
    backgroundColor: theme.colors.palette.green[500],
  },
  agentContextFillMedium: {
    backgroundColor: theme.colors.palette.amber[500],
  },
  agentContextFillHigh: {
    backgroundColor: theme.colors.palette.orange[500],
  },
  agentContextFillCritical: {
    backgroundColor: theme.colors.palette.red[500],
  },
  agentContextPercent: {
    fontFamily: theme.fontFamily.mono,
    fontSize: 10,
    lineHeight: 13,
    fontVariant: ["tabular-nums"],
    // Fixed width so the bars stay in one column regardless of 5% vs 100%.
    width: 24,
    textAlign: "right",
  },
  agentContextLow: {
    color: theme.colors.palette.green[500],
  },
  agentContextMedium: {
    color: theme.colors.palette.amber[500],
  },
  agentContextHigh: {
    color: theme.colors.palette.orange[500],
  },
  agentContextCritical: {
    color: theme.colors.palette.red[500],
  },
  rowMenuTrigger: {
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowMenuTriggerActive: {
    backgroundColor: theme.colors.surface2,
  },
  agentMenuOverlay: {
    position: "absolute",
    top: 3,
    right: theme.spacing[2],
    // Opaque cover matches the hovered row background so the menu reads as an
    // overlay on the title instead of a layout change.
    backgroundColor: theme.colors.surfaceSidebarHover,
    borderRadius: theme.borderRadius.sm,
  },
  agentMenuOverlayHidden: {
    opacity: 0,
  },
}));
