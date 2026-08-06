// Per-workspace usage aggregation + formatting for sidebar subtitle lines.
import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useShallow } from "zustand/shallow";
import { ArrowDownLeft, ArrowUpRight, Clock, Coins, Database } from "lucide-react-native";
import { useSessionStore, type Agent } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";

const ThemedCoins = withUnistyles(Coins);
const ThemedClock = withUnistyles(Clock);
const ThemedInput = withUnistyles(ArrowDownLeft);
const ThemedOutput = withUnistyles(ArrowUpRight);
const ThemedCache = withUnistyles(Database);

/** Token breakdown + active time for one workspace or a whole project. */
export interface UsageAggregate {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  runningMs: number;
}

export interface UsageBreakdown {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

type UsageSessionRef = { agents: ReadonlyMap<string, Agent> } | undefined;

function addUsage(
  current: UsageBreakdown | undefined,
  usage: NonNullable<Agent["cumulativeUsage"]>,
): UsageBreakdown {
  return {
    inputTokens: (current?.inputTokens ?? 0) + usage.inputTokens,
    cachedInputTokens: (current?.cachedInputTokens ?? 0) + usage.cachedInputTokens,
    outputTokens: (current?.outputTokens ?? 0) + usage.outputTokens,
  };
}

export function sumWorkspaceUsage(
  sessions: readonly UsageSessionRef[],
): Map<string, UsageAggregate> {
  const map = new Map<string, UsageAggregate>();
  for (const session of sessions) {
    if (!session) {
      continue;
    }
    for (const agent of session.agents.values()) {
      if (!agent.workspaceId) {
        continue;
      }
      const usage = agent.cumulativeUsage;
      if (!usage) {
        continue;
      }
      const key = `${agent.serverId}:${agent.workspaceId}`;
      const current = map.get(key);
      const tokens = addUsage(current, usage);
      map.set(key, {
        ...tokens,
        runningMs: (current?.runningMs ?? 0) + usage.runningMs,
      });
    }
  }
  return map;
}

export function formatCompactTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    const value = tokens / 1_000_000;
    return `${value >= 10 ? Math.round(value) : value.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    const value = tokens / 1_000;
    return `${value >= 10 ? Math.round(value) : value.toFixed(1)}K`;
  }
  return `${tokens}`;
}

export function formatRunningTime(runningMs: number): string {
  const totalSeconds = Math.max(0, Math.round(runningMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function totalTokens(aggregate: UsageAggregate): number {
  return aggregate.inputTokens + aggregate.cachedInputTokens + aggregate.outputTokens;
}

export function formatUsageLabel(aggregate: UsageAggregate): string | null {
  const total = totalTokens(aggregate);
  const parts: string[] = [];
  if (total > 0) {
    parts.push(`${formatCompactTokens(total)} tokens total`);
    if (aggregate.inputTokens > 0) {
      parts.push(`${formatCompactTokens(aggregate.inputTokens)} in`);
    }
    if (aggregate.outputTokens > 0) {
      parts.push(`${formatCompactTokens(aggregate.outputTokens)} out`);
    }
    if (aggregate.cachedInputTokens > 0) {
      parts.push(`${formatCompactTokens(aggregate.cachedInputTokens)} cached`);
    }
  }
  if (aggregate.runningMs > 0) {
    parts.push(formatRunningTime(aggregate.runningMs));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function aggregateForWorkspace(
  workspaceKey: string,
  sessions: readonly UsageSessionRef[],
  filter: (key: string) => boolean,
): UsageAggregate | null {
  let tokens: UsageBreakdown | undefined;
  let runningMs = 0;
  for (const session of sessions) {
    if (!session) {
      continue;
    }
    for (const agent of session.agents.values()) {
      if (!agent.workspaceId) {
        continue;
      }
      if (!filter(`${agent.serverId}:${agent.workspaceId}`)) {
        continue;
      }
      const usage = agent.cumulativeUsage;
      if (!usage) {
        continue;
      }
      tokens = addUsage(tokens, usage);
      runningMs += usage.runningMs;
    }
  }
  return tokens ? { ...tokens, runningMs } : null;
}

/** Tokens + active time for one workspace, from all agents (archived included). */
export function useWorkspaceUsageAggregate(workspaceKey: string): UsageAggregate | null {
  const sessions = useSessionStore(useShallow((state) => Object.values(state.sessions)));
  return useMemo(
    () => aggregateForWorkspace(workspaceKey, sessions, (key) => key === workspaceKey),
    [sessions, workspaceKey],
  );
}

/** Aggregate tokens + active time across a set of workspaces (project header). */
export function useProjectUsage(workspaceKeys: readonly string[]): UsageAggregate | null {
  const sessions = useSessionStore(useShallow((state) => Object.values(state.sessions)));
  const keys = useMemo(() => new Set(workspaceKeys), [workspaceKeys]);
  return useMemo(
    () => aggregateForWorkspace("", sessions, (key) => keys.has(key)),
    [sessions, keys],
  );
}

/**
 * Color-coded token strip: total in foreground, then input/output/cached each in its own
 * muted status hue so the breakdown is scannable instead of one grey wall of text.
 */
export function UsageSubtitle({ aggregate }: { aggregate: UsageAggregate }) {
  const label = formatUsageLabel(aggregate);
  const total = totalTokens(aggregate);
  if (!label) {
    return null;
  }
  return (
    <View style={usageStyles.usageRow} accessibilityLabel={label}>
      {total > 0 ? (
        <View style={usageStyles.usageSegment} testID="usage-total">
          <ThemedCoins size={9} uniProps={foregroundMapping} />
          <Text style={usageStyles.totalText} numberOfLines={1}>
            {formatCompactTokens(total)}
          </Text>
        </View>
      ) : null}
      {aggregate.inputTokens > 0 ? (
        <View style={usageStyles.usageSegment} testID="usage-input">
          <ThemedInput size={9} uniProps={inputColorMapping} />
          <Text style={usageStyles.inputText} numberOfLines={1}>
            {formatCompactTokens(aggregate.inputTokens)}
          </Text>
        </View>
      ) : null}
      {aggregate.outputTokens > 0 ? (
        <View style={usageStyles.usageSegment} testID="usage-output">
          <ThemedOutput size={9} uniProps={outputColorMapping} />
          <Text style={usageStyles.outputText} numberOfLines={1}>
            {formatCompactTokens(aggregate.outputTokens)}
          </Text>
        </View>
      ) : null}
      {aggregate.cachedInputTokens > 0 ? (
        <View style={usageStyles.usageSegment} testID="usage-cached">
          <ThemedCache size={9} uniProps={cachedColorMapping} />
          <Text style={usageStyles.cachedText} numberOfLines={1}>
            {formatCompactTokens(aggregate.cachedInputTokens)}
          </Text>
        </View>
      ) : null}
      {aggregate.runningMs > 0 ? (
        <View style={usageStyles.usageSegment} testID="usage-time">
          <ThemedClock size={9} uniProps={foregroundMutedMapping} />
          <Text style={usageStyles.timeText} numberOfLines={1}>
            {formatRunningTime(aggregate.runningMs)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const inputColorMapping = (theme: Theme) => ({ color: theme.colors.statusMutedWarning });
const outputColorMapping = (theme: Theme) => ({ color: theme.colors.statusMutedMerged });
const cachedColorMapping = (theme: Theme) => ({ color: theme.colors.statusMutedSuccess });

const usageStyles = StyleSheet.create((theme) => ({
  usageRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[1],
    minWidth: 0,
  },
  usageSegment: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1] / 2,
    flexShrink: 0,
  },
  totalText: {
    color: theme.colors.foreground,
    fontSize: 9,
    lineHeight: 12,
    includeFontPadding: false,
    fontWeight: theme.fontWeight.medium,
  },
  inputText: {
    color: theme.colors.statusMutedWarning,
    fontSize: 9,
    lineHeight: 12,
    includeFontPadding: false,
  },
  outputText: {
    color: theme.colors.statusMutedMerged,
    fontSize: 9,
    lineHeight: 12,
    includeFontPadding: false,
  },
  cachedText: {
    color: theme.colors.statusMutedSuccess,
    fontSize: 9,
    lineHeight: 12,
    includeFontPadding: false,
  },
  timeText: {
    color: theme.colors.foregroundMuted,
    fontSize: 9,
    lineHeight: 12,
    includeFontPadding: false,
  },
}));
