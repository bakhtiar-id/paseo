// Per-workspace usage aggregation + formatting for sidebar subtitle lines.
import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useShallow } from "zustand/shallow";
import { Clock, Coins } from "lucide-react-native";
import { useSessionStore, type Agent } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";

const foregroundMutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedCoins = withUnistyles(Coins);
const ThemedClock = withUnistyles(Clock);

export interface UsageAggregate {
  tokens: number;
  runningMs: number;
}

type UsageSessionRef = { agents: ReadonlyMap<string, Agent> } | undefined;

export function sumWorkspaceUsage(
  sessions: readonly UsageSessionRef[],
): Map<string, UsageAggregate> {
  const map = new Map<string, UsageAggregate>();
  for (const session of sessions) {
    if (!session) {
      continue;
    }
    for (const agent of session.agents.values()) {
      if (agent.archivedAt || !agent.workspaceId) {
        continue;
      }
      const usage = agent.cumulativeUsage;
      if (!usage) {
        continue;
      }
      const key = `${agent.serverId}:${agent.workspaceId}`;
      const current = map.get(key);
      map.set(key, {
        tokens:
          (current?.tokens ?? 0) + usage.inputTokens + usage.cachedInputTokens + usage.outputTokens,
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

export function formatUsageLabel(aggregate: UsageAggregate): string | null {
  const parts: string[] = [];
  if (aggregate.tokens > 0) {
    parts.push(`${formatCompactTokens(aggregate.tokens)} tokens`);
  }
  if (aggregate.runningMs > 0) {
    parts.push(formatRunningTime(aggregate.runningMs));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Tokens + active time for one workspace, from live non-archived agents only. */
export function useWorkspaceUsageAggregate(workspaceKey: string): UsageAggregate | null {
  const sessions = useSessionStore(useShallow((state) => Object.values(state.sessions)));
  return useMemo(() => {
    let tokens = 0;
    let runningMs = 0;
    let seen = false;
    for (const session of sessions) {
      if (!session) {
        continue;
      }
      for (const agent of session.agents.values()) {
        if (agent.archivedAt || !agent.workspaceId) {
          continue;
        }
        if (`${agent.serverId}:${agent.workspaceId}` !== workspaceKey) {
          continue;
        }
        const usage = agent.cumulativeUsage;
        if (!usage) {
          continue;
        }
        seen = true;
        tokens += usage.inputTokens + usage.cachedInputTokens + usage.outputTokens;
        runningMs += usage.runningMs;
      }
    }
    return seen ? { tokens, runningMs } : null;
  }, [sessions, workspaceKey]);
}

/** "Coins 248K · Clock 1h 40m" — small muted meta line for a pre-summed aggregate. */
export function UsageSubtitle({ aggregate }: { aggregate: UsageAggregate }) {
  const label = formatUsageLabel(aggregate);
  if (!label) {
    return null;
  }
  return (
    <View style={usageStyles.usageRow} accessibilityLabel={label}>
      {aggregate.tokens > 0 ? (
        <View style={usageStyles.usageSegment}>
          <ThemedCoins size={9} uniProps={foregroundMutedIconMapping} />
          <Text style={usageStyles.usageText}>{formatCompactTokens(aggregate.tokens)}</Text>
        </View>
      ) : null}
      {aggregate.runningMs > 0 ? (
        <View style={usageStyles.usageSegment}>
          <ThemedClock size={9} uniProps={foregroundMutedIconMapping} />
          <Text style={usageStyles.usageText}>{formatRunningTime(aggregate.runningMs)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const usageStyles = StyleSheet.create((theme) => ({
  usageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    minWidth: 0,
  },
  usageSegment: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1] / 2,
    flexShrink: 0,
  },
  usageText: {
    color: theme.colors.foregroundMuted,
    fontSize: 9,
    lineHeight: 12,
    includeFontPadding: false,
  },
}));
