import type { AgentStateBucketInput } from "@getpaseo/protocol/agent-state-bucket";
import type { HostRuntimeConnectionStatus } from "@/runtime/host-runtime";
import type { ProviderUsage, ProviderUsageWindow } from "@/provider-usage/types";
import { deriveSidebarStateBucket, type SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { STATUS_BUCKET_ORDER } from "@/hooks/sidebar-status-view-model";

export interface FooterBucketCount {
  bucket: SidebarStateBucket;
  count: number;
}

/**
 * Non-empty bucket counts in STATUS_BUCKET_ORDER, plus the total. `done` is
 * counted but reported last so the footer can drop it when space runs short.
 */
export function countAgentsByBucket(agents: readonly AgentStateBucketInput[]): {
  buckets: FooterBucketCount[];
  total: number;
} {
  const counts = new Map<SidebarStateBucket, number>();
  for (const agent of agents) {
    const bucket = deriveSidebarStateBucket({
      status: agent.status,
      pendingPermissionCount: agent.pendingPermissionCount,
      requiresAttention: agent.requiresAttention,
      attentionReason: agent.attentionReason,
    });
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const buckets: FooterBucketCount[] = [];
  for (const bucket of STATUS_BUCKET_ORDER) {
    const count = counts.get(bucket) ?? 0;
    if (count > 0) {
      buckets.push({ bucket, count });
    }
  }
  return { buckets, total: agents.length };
}

export interface FooterHostSummary {
  online: number;
  total: number;
  hasProblem: boolean;
}

/** Online-host tally. `hasProblem` means at least one host is offline or errored. */
export function summarizeHosts(
  serverIds: readonly string[],
  statuses: ReadonlyMap<string, HostRuntimeConnectionStatus>,
): FooterHostSummary {
  let online = 0;
  let problem = false;
  for (const serverId of serverIds) {
    const status = statuses.get(serverId);
    if (status === "online") {
      online += 1;
    } else if (status === "offline" || status === "error") {
      problem = true;
    }
  }
  return { online, total: serverIds.length, hasProblem: problem };
}

function resolveWindowRemainingPct(window: ProviderUsageWindow): number | null {
  if (window.remainingPct != null) return window.remainingPct;
  if (window.usedPct != null) return 100 - window.usedPct;
  return null;
}

export interface FooterUsageWindow {
  window: ProviderUsageWindow;
  remainingPct: number;
}

/**
 * Windows with a resolvable remaining percentage, most constrained (closest to
 * running out) first. Windows with no resolvable percentage are excluded.
 */
export function footerUsageWindows(usage: ProviderUsage): FooterUsageWindow[] {
  const rows: FooterUsageWindow[] = [];
  for (const window of usage.windows) {
    const remainingPct = resolveWindowRemainingPct(window);
    if (remainingPct == null) continue;
    rows.push({ window, remainingPct });
  }
  rows.sort((a, b) => a.remainingPct - b.remainingPct);
  return rows;
}
