import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { usePathname } from "expo-router";
import { CalendarClock, CircleAlert, Download, Server } from "lucide-react-native";
import { useShallow } from "zustand/shallow";
import { agentContextPercent } from "@/components/sidebar/sidebar-context-usage";
import { StatusBadge } from "@/components/ui/status-badge";
import { STATUS_FOOTER_HEIGHT } from "@/constants/layout";
import { useAggregatedAgents } from "@/hooks/use-aggregated-agents";
import { useSchedules } from "@/hooks/use-schedules";
import { useDesktopAppUpdater } from "@/desktop/updates/use-desktop-app-updater";
import {
  useEarliestOnlineHostServerId,
  useHostRuntimeConnectionStatuses,
  useHosts,
} from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { formatNextRun } from "@/utils/schedule-format";
import { parseHostWorkspaceRouteFromPathname } from "@/utils/host-routes";
import { countAgentsByBucket, summarizeHosts } from "./footer-stats";
import { ProviderLimitChips } from "./provider-limit-chips";

const mutedIconColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const dangerIconColor = (theme: Theme) => ({ color: theme.colors.statusDanger });
const accentIconColor = (theme: Theme) => ({ color: theme.colors.statusSuccess });

const ThemedServer = withUnistyles(Server);
const ThemedCircleAlert = withUnistyles(CircleAlert);
const ThemedCalendarClock = withUnistyles(CalendarClock);
const ThemedDownload = withUnistyles(Download);

// Two chips: orange = still doing something, green = done. Detail lives in the
// sidebar rows; the footer headline is "how many need my attention vs finished".
function AgentCounts() {
  const { t } = useTranslation();
  const { agents } = useAggregatedAgents();
  const { buckets, total } = useMemo(
    () =>
      countAgentsByBucket(
        agents.map((agent) => ({
          status: agent.status,
          pendingPermissionCount: agent.pendingPermissionCount,
          requiresAttention: agent.requiresAttention,
          attentionReason: agent.attentionReason,
        })),
      ),
    [agents],
  );
  const doneCount = buckets.find((entry) => entry.bucket === "done")?.count ?? 0;
  const activeCount = total - doneCount;

  return (
    <View style={styles.group} testID="status-footer-agent-counts">
      {total === 0 ? (
        <Text style={styles.strong}>{t("statusFooter.agents", { count: total })}</Text>
      ) : (
        <>
          {activeCount > 0 ? (
            <StatusBadge
              label={t("statusFooter.active", { count: activeCount })}
              variant="warning"
              style={styles.compactPill}
            />
          ) : null}
          {doneCount > 0 ? (
            <StatusBadge
              label={t("statusFooter.done", { count: doneCount })}
              variant="success"
              style={styles.compactPill}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

function HostStatus() {
  const { t } = useTranslation();
  const hosts = useHosts();
  const serverIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const statuses = useHostRuntimeConnectionStatuses(serverIds);
  const summary = useMemo(() => summarizeHosts(serverIds, statuses), [serverIds, statuses]);

  if (summary.total === 0) {
    return null;
  }

  return (
    <View
      style={styles.group}
      testID="status-footer-hosts"
      accessibilityLabel={t("statusFooter.hostsOnline", {
        online: summary.online,
        total: summary.total,
      })}
    >
      {summary.hasProblem ? (
        <ThemedCircleAlert size={12} uniProps={dangerIconColor} />
      ) : (
        <ThemedServer size={12} uniProps={summary.online > 0 ? accentIconColor : mutedIconColor} />
      )}
      <Text style={summary.hasProblem ? styles.dangerText : styles.count} numberOfLines={1}>
        {`${summary.online}/${summary.total}`}
      </Text>
    </View>
  );
}

// Context % for the agent the user is actually looking at. Route-derived rather
// than "most recently focused anywhere" so the number matches the open workspace.
function ActiveAgentContext() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const route = parseHostWorkspaceRouteFromPathname(pathname);
  const serverId = route?.serverId ?? null;
  const percent = useSessionStore(
    useShallow((state) => {
      if (!serverId) return null;
      const session = state.sessions[serverId];
      const agentId = session?.focusedAgentId;
      if (!session || !agentId) return null;
      const agent = session.agents.get(agentId);
      return agent ? agentContextPercent(agent) : null;
    }),
  );

  if (percent === null) {
    return null;
  }

  return (
    <Text style={styles.muted} numberOfLines={1} testID="status-footer-context">
      {t("statusFooter.context", { percentage: percent })}
    </Text>
  );
}

function NextScheduledRun() {
  const { loadState } = useSchedules();
  const next = useMemo(() => {
    if (loadState.status !== "loaded") return null;
    let earliest: string | null = null;
    for (const schedule of loadState.data) {
      if (schedule.status !== "active" || !schedule.nextRunAt) continue;
      if (!earliest || schedule.nextRunAt < earliest) {
        earliest = schedule.nextRunAt;
      }
    }
    return earliest;
  }, [loadState]);

  const label = next ? formatNextRun(next) : "";
  if (!label) {
    return null;
  }

  return (
    <View style={styles.group} testID="status-footer-next-run">
      <ThemedCalendarClock size={12} uniProps={mutedIconColor} />
      <Text style={styles.muted} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function UpdateIndicator() {
  const { t } = useTranslation();
  const { isDesktopApp, availableUpdate } = useDesktopAppUpdater();

  if (!isDesktopApp || !availableUpdate) {
    return null;
  }

  return (
    <View style={styles.group} testID="status-footer-update">
      <ThemedDownload size={12} uniProps={accentIconColor} />
      <Text style={styles.accent} numberOfLines={1}>
        {t("statusFooter.updateAvailable")}
      </Text>
    </View>
  );
}

export function StatusFooter() {
  const providerServerId = useEarliestOnlineHostServerId();

  return (
    <View style={styles.footer} testID="status-footer">
      <AgentCounts />
      <View style={styles.separator} />
      <HostStatus />
      <View style={styles.spacer} />
      <ActiveAgentContext />
      <NextScheduledRun />
      <UpdateIndicator />
      <ProviderLimitChips serverId={providerServerId} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  footer: {
    height: STATUS_FOOTER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    overflow: "hidden",
  },
  group: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    flexShrink: 0,
  },
  // The footer is 25px tall — the default pill padding makes it touch the bar edges.
  compactPill: {
    paddingVertical: 0,
  },
  spacer: {
    flex: 1,
    minWidth: theme.spacing[2],
  },
  separator: {
    width: theme.borderWidth[1],
    height: 12,
    backgroundColor: theme.colors.border,
    flexShrink: 0,
  },
  count: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  dangerText: {
    color: theme.colors.statusDanger,
    fontFamily: theme.fontFamily.mono,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  strong: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  danger: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.xs,
  },
  accent: {
    color: theme.colors.statusSuccess,
    fontSize: theme.fontSize.xs,
  },
}));
