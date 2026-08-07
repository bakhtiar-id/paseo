// Per-workspace usage aggregation + formatting for sidebar subtitle lines.
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useShallow } from "zustand/shallow";
import { ArrowDownLeft, ArrowUpRight, Clock, Coins, Database } from "lucide-react-native";
import { useSessionStore, type Agent, type SessionState } from "@/stores/session-store";
import {
  mergeProjectUsageTotals,
  useProjectUsageLedgerStore,
} from "@/stores/project-usage-ledger-store";
import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";
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

type ProjectUsageSession = Pick<SessionState, "serverId" | "projects" | "agents">;

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

function aggregateAgents(
  sessions: readonly UsageSessionRef[],
  matches: (agent: Agent) => boolean,
): UsageAggregate | null {
  let tokens: UsageBreakdown | undefined;
  let runningMs = 0;
  for (const session of sessions) {
    if (!session) {
      continue;
    }
    for (const agent of session.agents.values()) {
      if (!matches(agent)) {
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

/**
 * Ticks `Date.now()` every second while `running` is true, so a sidebar row's
 * elapsed time can keep advancing live mid-turn. Stops (and stays put) when the
 * turn is done; the finalized `cumulativeUsage.runningMs` then carries the total.
 */
function useLiveNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) {
      return;
    }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  return now;
}

/**
 * Wall-clock time the given running agent has been active since its current turn
 * started. 0 when the agent isn't running or has no start timestamp. The server
 * only finalizes `runningMs` at turn boundaries, so this is the live portion the
 * sidebar must add on top to keep the timer from going blank mid-turn.
 */
export function liveRunningMs(agent: Agent, now: number): number {
  if (agent.status !== "running") {
    return 0;
  }
  const startedAt = agent.activeTurn?.startedAt;
  return startedAt ? Math.max(0, now - startedAt.getTime()) : 0;
}

function liveRunningOffsetMs(
  sessions: readonly UsageSessionRef[],
  matches: (agent: Agent) => boolean,
  now: number,
): number {
  let pending = 0;
  for (const session of sessions) {
    if (!session) {
      continue;
    }
    for (const agent of session.agents.values()) {
      if (matches(agent)) {
        pending += liveRunningMs(agent, now);
      }
    }
  }
  return pending;
}

function withLiveRunningTime(base: UsageAggregate | null, pending: number): UsageAggregate | null {
  if (!base) {
    return pending > 0
      ? { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, runningMs: pending }
      : null;
  }
  return { ...base, runningMs: base.runningMs + pending };
}

/** Tokens + active time for one workspace, from all agents (archived included). */
export function useWorkspaceUsageAggregate(workspaceKey: string): UsageAggregate | null {
  const sessions = useSessionStore(useShallow((state) => Object.values(state.sessions)));
  const matches = useMemo(
    () => (agent: Agent) =>
      agent.workspaceId != null && `${agent.serverId}:${agent.workspaceId}` === workspaceKey,
    [workspaceKey],
  );
  const anyRunning = sessions.some(
    (session) =>
      session &&
      Array.from(session.agents.values()).some(
        (agent) => matches(agent) && agent.status === "running",
      ),
  );
  const now = useLiveNow(anyRunning);
  return useMemo(
    () =>
      withLiveRunningTime(
        aggregateAgents(sessions, matches),
        liveRunningOffsetMs(sessions, matches, now),
      ),
    [sessions, matches, now],
  );
}

function buildProjectUsageMatcher(project: SidebarProjectEntry): (agent: Agent) => boolean {
  // A placement's `projectKey` is the host's opaque project id, not the derived
  // equivalence key a project descriptor carries, so it is only comparable
  // within one server.
  const placementKeys = new Set(project.hosts.map((host) => `${host.serverId}:${host.projectId}`));
  const workspaceKeys = new Set(project.workspaces.map((workspace) => workspace.workspaceKey));
  return (agent) => {
    if (agent.workspaceId && workspaceKeys.has(`${agent.serverId}:${agent.workspaceId}`)) {
      return true;
    }
    const placementKey = agent.projectPlacement?.projectKey;
    return placementKey != null && placementKeys.has(`${agent.serverId}:${placementKey}`);
  };
}

/**
 * Aggregate tokens + active time across a project's workspaces, from all agents
 * (archived included). Archived workspaces keep counting for as long as their
 * project lives: their agents are retained in the session store after archive,
 * and are matched back to the project by their placement's project id.
 */
export function aggregateProjectUsage(
  sessions: readonly ProjectUsageSession[],
  project: SidebarProjectEntry,
): UsageAggregate | null {
  return aggregateAgents(sessions, buildProjectUsageMatcher(project));
}

/**
 * Aggregate tokens + active time across a project (project header).
 *
 * The observed aggregate can drop to nothing — every workspace archived, the
 * host reconnecting with an active-scoped agent refetch, a cold app start
 * before any agent has loaded. The device-local ledger holds the last high-water
 * mark for the project so the strip doesn't blank out in those windows.
 */
export function useProjectUsage(project: SidebarProjectEntry): UsageAggregate | null {
  const sessions = useSessionStore(useShallow((state) => Object.values(state.sessions)));
  const matcher = useMemo(() => buildProjectUsageMatcher(project), [project]);
  const anyRunning = sessions.some(
    (session) =>
      session &&
      Array.from(session.agents.values()).some(
        (agent) => matcher(agent) && agent.status === "running",
      ),
  );
  const now = useLiveNow(anyRunning);
  const observed = useMemo(
    () =>
      withLiveRunningTime(
        aggregateAgents(sessions, matcher),
        liveRunningOffsetMs(sessions, matcher, now),
      ),
    [sessions, matcher, now],
  );
  const stored = useProjectUsageLedgerStore(
    (state) => state.totalsByProjectViewKey[project.viewKey],
  );
  const recordProjectUsage = useProjectUsageLedgerStore((state) => state.recordProjectUsage);
  useEffect(() => {
    recordProjectUsage(project.viewKey, observed);
  }, [recordProjectUsage, project.viewKey, observed]);
  return useMemo(() => mergeProjectUsageTotals(stored, observed), [stored, observed]);
}

/** Aggregate tokens + active time for a single agent row, including live elapsed time. */
export function useLiveAgentUsage(agent: Agent): UsageAggregate | null {
  const running = agent.status === "running";
  const now = useLiveNow(running);
  return useMemo(
    () => withLiveRunningTime(agent.cumulativeUsage ?? null, liveRunningMs(agent, now)),
    [agent, now],
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
const inputColorMapping = (theme: Theme) => ({ color: theme.colors.statusWarning });
const outputColorMapping = (theme: Theme) => ({ color: theme.colors.statusMerged });
const cachedColorMapping = (theme: Theme) => ({ color: theme.colors.statusSuccess });

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
    color: theme.colors.statusWarning,
    fontSize: 9,
    lineHeight: 12,
    includeFontPadding: false,
  },
  outputText: {
    color: theme.colors.statusMerged,
    fontSize: 9,
    lineHeight: 12,
    includeFontPadding: false,
  },
  cachedText: {
    color: theme.colors.statusSuccess,
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
