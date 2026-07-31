import type { Agent } from "@/stores/session-store";

export type ContextUsageTier = "low" | "medium" | "high" | "critical";

/** Percentage of the context window an agent has consumed, or null when unknown. */
export function agentContextPercent(agent: Agent): number | null {
  const max = agent.lastUsage?.contextWindowMaxTokens;
  const used = agent.lastUsage?.contextWindowUsedTokens;
  if (typeof max !== "number" || typeof used !== "number" || !(max > 0) || used < 0) {
    return null;
  }
  return Math.min(100, Math.round((used / max) * 100));
}

export function contextUsageTier(percent: number): ContextUsageTier {
  if (percent >= 90) {
    return "critical";
  }
  if (percent >= 75) {
    return "high";
  }
  if (percent >= 50) {
    return "medium";
  }
  return "low";
}
