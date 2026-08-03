import { memo, useCallback, useMemo, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useShallow } from "zustand/shallow";
import { CircleDot } from "lucide-react-native";
import { useSessionStore, type Agent } from "@/stores/session-store";
import { deriveSidebarStateBucket, type SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { STATUS_BUCKET_ORDER, useStatusBucketLabels } from "@/hooks/sidebar-status-view-model";
import { getProviderIcon, type ProviderIconProps } from "@/components/provider-icons";
import { MODE_ICONS } from "@/agent-controls/icons";
import { formatAgentModeLabel, formatThinkingOptionLabel } from "@/agent-controls/labels";
import { shortModelLabel } from "@/composer/agent-controls/model-sheet";
import { formatTimeAgo } from "@/utils/time";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { baseColors, type Theme } from "@/styles/theme";
import { PulsingDot, PulsingHalo } from "@/components/ui/pulsing-dot";
import {
  AgentContextBar,
  AgentRowMetaLine,
  AgentStatusIcon,
} from "@/components/sidebar/sidebar-agent-row";
import { agentContextPercent } from "@/components/sidebar/sidebar-context-usage";
import { agentDoneKey, useAgentDoneStore } from "@/stores/agent-done-store";
import { resolveWorkspaceMapKeyByIdentity } from "@/utils/workspace-identity";
import { SidebarGroupToggleRow } from "./sidebar-group-toggle-row";
import { useLimitedSidebarGroup } from "./use-limited-sidebar-group";

const foregroundMutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedLiveDot = withUnistyles(CircleDot);

// Same cache pattern as sidebar-agent-row: provider/mode icons vary per row.
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

interface LiveEntry {
  agent: Agent;
  bucket: SidebarStateBucket;
  contextLabel: string | null;
}

function useLiveSidebarEntries(): LiveEntry[] {
  const manualDoneKeys = useAgentDoneStore((state) => state.manuallyDoneAgentKeys);
  const liveAgents = useSessionStore(
    useShallow((state) => {
      const out: Agent[] = [];
      for (const session of Object.values(state.sessions)) {
        if (!session) continue;
        for (const agent of session.agents.values()) {
          if (agent.archivedAt) continue;
          if (
            agent.workspaceId &&
            session.hasHydratedWorkspaces &&
            !resolveWorkspaceMapKeyByIdentity({
              workspaces: session.workspaces,
              workspaceId: agent.workspaceId,
            })
          ) {
            continue;
          }
          if (manualDoneKeys.has(agentDoneKey(agent.serverId, agent.id))) continue;
          const bucket = deriveSidebarStateBucket({
            status: agent.status,
            pendingPermissionCount: agent.pendingPermissions.length,
            requiresAttention: agent.requiresAttention,
            attentionReason: agent.attentionReason,
          });
          if (bucket === "done") continue;
          out.push(agent);
        }
      }
      return out;
    }),
  );
  // "project/workspace" so a live row says which repo it belongs to, not just
  // which branch. Collapses to one part when they'd read the same.
  const workspaceLabels = useSessionStore(
    useShallow((state) => {
      const map = new Map<string, string>();
      for (const [serverId, session] of Object.entries(state.sessions)) {
        if (!session?.workspaces) continue;
        for (const [workspaceId, workspace] of session.workspaces) {
          const project = workspace.projectCustomName || workspace.projectDisplayName || null;
          const workspaceLabel = workspace.title || workspace.name || null;
          const label =
            project && workspaceLabel && project !== workspaceLabel
              ? `${project}/${workspaceLabel}`
              : (project ?? workspaceLabel);
          if (label) {
            map.set(`${serverId}:${workspaceId}`, label);
          }
        }
      }
      return map;
    }),
  );

  return useMemo(() => {
    const priorityByBucket = new Map(STATUS_BUCKET_ORDER.map((bucket, index) => [bucket, index]));
    const entries: LiveEntry[] = liveAgents.map((agent) => ({
      agent,
      bucket: deriveSidebarStateBucket({
        status: agent.status,
        pendingPermissionCount: agent.pendingPermissions.length,
        requiresAttention: agent.requiresAttention,
        attentionReason: agent.attentionReason,
      }),
      contextLabel: agent.workspaceId
        ? (workspaceLabels.get(`${agent.serverId}:${agent.workspaceId}`) ?? null)
        : null,
    }));
    entries.sort((a, b) => {
      const priorityDiff =
        (priorityByBucket.get(a.bucket) ?? STATUS_BUCKET_ORDER.length) -
        (priorityByBucket.get(b.bucket) ?? STATUS_BUCKET_ORDER.length);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      // Created-at keeps the order stable: lastActivityAt would re-sort a row to
      // the top on every update tick.
      return b.agent.createdAt.getTime() - a.agent.createdAt.getTime();
    });
    return entries;
  }, [liveAgents, workspaceLabels]);
}

const SidebarLiveNowRow = memo(function SidebarLiveNowRow({ entry }: { entry: LiveEntry }) {
  const { agent, bucket, contextLabel } = entry;
  const { t } = useTranslation();
  const statusLabels = useStatusBucketLabels();
  const title = agent.title?.trim() || t("agentList.fallbackTitle");
  const elapsed = formatTimeAgo(agent.lastActivityAt);

  const mode = agent.currentModeId
    ? (agent.availableModes.find((m) => m.id === agent.currentModeId) ?? null)
    : null;
  const modeLabel = mode ? formatAgentModeLabel(mode) : null;
  const ModeIcon = mode?.icon ? (MODE_ICONS[mode.icon] ?? MODE_ICONS.Bot) : null;
  const modeIcon = useMemo(() => {
    if (!ModeIcon) {
      return null;
    }
    const ThemedModeIcon = themedIcon(ModeIcon as ComponentType<ProviderIconProps>);
    return <ThemedModeIcon size={10} uniProps={foregroundMutedIconMapping} />;
  }, [ModeIcon]);

  const thinkingId = agent.thinkingOptionId ?? null;
  const thinkingLabel =
    thinkingId && !["off", "none", "default"].includes(thinkingId.toLowerCase())
      ? formatThinkingOptionLabel({ id: thinkingId })
      : null;

  const modelLabel = agent.model ? shortModelLabel(agent.model) : null;
  const contextPercent = agentContextPercent(agent);
  const ProviderIcon = useMemo(() => themedIcon(getProviderIcon(agent.provider)), [agent.provider]);

  const handlePress = useCallback(() => {
    navigateToAgent({ serverId: agent.serverId, agentId: agent.id });
  }, [agent.serverId, agent.id]);

  const isNeedsInput = bucket === "needs_input";
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      isNeedsInput && styles.rowNeedsInput,
      (Boolean(hovered) || pressed) && styles.rowHovered,
    ],
    [isNeedsInput],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        title,
        statusLabels[bucket],
        contextLabel,
        contextPercent === null ? null : t("contextWindow.used", { percentage: contextPercent }),
        elapsed,
      ]
        .filter(Boolean)
        .join(", ")}
      onPress={handlePress}
      style={rowStyle}
      testID={`sidebar-live-now-row-${agent.serverId}-${agent.id}`}
    >
      <View style={styles.topLine}>
        <View style={styles.glyphSlot}>
          {isNeedsInput ? <PulsingHalo color={baseColors.amber[500]} size={14} /> : null}
          <ProviderIcon size={14} uniProps={foregroundMutedIconMapping} />
        </View>
        <View style={styles.metaFlex}>
          <AgentRowMetaLine
            modelLabel={modelLabel}
            modeLabel={modeLabel}
            modeTier="moderate"
            modeIcon={modeIcon}
            thinkingLabel={thinkingLabel}
            contextLabel={contextLabel}
          />
        </View>
        <Text style={isNeedsInput ? styles.elapsedWarn : styles.elapsed} numberOfLines={1}>
          {elapsed}
        </Text>
        <AgentStatusIcon bucket={bucket} />
      </View>
      <View style={styles.bottomLine}>
        <Text style={styles.userMessage} numberOfLines={1}>
          {title}
        </Text>
        {contextPercent === null ? null : <AgentContextBar percent={contextPercent} />}
      </View>
    </Pressable>
  );
});

export function SidebarLiveNowSection() {
  const { t } = useTranslation();
  const entries = useLiveSidebarEntries();
  const { visibleItems, expanded, canToggle, toggleExpanded } = useLimitedSidebarGroup(entries, 4);
  // Needs input trumps failure trumps plain activity; nothing live stays muted.
  const liveDotColor = useMemo(() => {
    if (entries.some((entry) => entry.bucket === "needs_input")) {
      return baseColors.amber[500];
    }
    if (entries.some((entry) => entry.bucket === "failed")) {
      return baseColors.red[500];
    }
    return entries.length > 0 ? baseColors.green[500] : null;
  }, [entries]);

  return (
    <View style={styles.section} testID="sidebar-live-now">
      <View style={styles.header}>
        {liveDotColor ? (
          <PulsingDot color={liveDotColor} size={8} />
        ) : (
          <ThemedLiveDot size={8} uniProps={foregroundMutedIconMapping} />
        )}
        <Text style={styles.headerTitle}>{t("sidebar.liveNow.title")}</Text>
        <Text style={styles.headerCount}>{entries.length}</Text>
      </View>
      {entries.length === 0 ? (
        <Text style={styles.empty}>{t("sidebar.liveNow.empty")}</Text>
      ) : (
        visibleItems.map((entry) => (
          <SidebarLiveNowRow key={`${entry.agent.serverId}:${entry.agent.id}`} entry={entry} />
        ))
      )}
      {canToggle ? (
        <SidebarGroupToggleRow
          expanded={expanded}
          onPress={toggleExpanded}
          testID="sidebar-live-now-toggle"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    marginHorizontal: theme.spacing[2],
    marginBottom: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
  },
  headerTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
  },
  headerCount: {
    marginLeft: "auto",
    color: theme.colors.foregroundExtraMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: 10,
  },
  empty: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
  },
  row: {
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 2,
    userSelect: "none",
  },
  rowNeedsInput: {
    backgroundColor: `${baseColors.amber[500]}12`,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  glyphSlot: {
    position: "relative",
    width: theme.iconSize.sm,
    height: 15,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  metaFlex: {
    flex: 1,
    minWidth: 0,
  },
  bottomLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    marginLeft: theme.iconSize.sm + theme.spacing[1.5],
  },
  userMessage: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 17,
    flex: 1,
    minWidth: 0,
  },
  elapsed: {
    flexShrink: 0,
    color: theme.colors.foregroundExtraMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: 10,
  },
  elapsedWarn: {
    flexShrink: 0,
    color: baseColors.amber[500],
    fontFamily: theme.fontFamily.mono,
    fontSize: 10,
  },
}));
