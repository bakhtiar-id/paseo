import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface ProjectUsageTotals {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  runningMs: number;
}

interface ProjectUsageLedgerState {
  totalsByProjectViewKey: Record<string, ProjectUsageTotals>;
  recordProjectUsage: (projectViewKey: string, totals: ProjectUsageTotals | null) => void;
}

/**
 * Per-field high-water mark. Agent usage only ever grows, so the observed
 * aggregate for a project is monotonic while its agents are in the store — it
 * drops only when agents leave (workspace archived, agent evicted, host
 * reconnected with an active-scoped refetch). Taking the max keeps the sidebar
 * counter from falling back in those cases.
 */
export function mergeProjectUsageTotals(
  stored: ProjectUsageTotals | undefined,
  observed: ProjectUsageTotals | null,
): ProjectUsageTotals | null {
  if (!observed) {
    return stored ?? null;
  }
  if (!stored) {
    return observed;
  }
  return {
    inputTokens: Math.max(stored.inputTokens, observed.inputTokens),
    cachedInputTokens: Math.max(stored.cachedInputTokens, observed.cachedInputTokens),
    outputTokens: Math.max(stored.outputTokens, observed.outputTokens),
    runningMs: Math.max(stored.runningMs, observed.runningMs),
  };
}

function isSameTotals(left: ProjectUsageTotals, right: ProjectUsageTotals): boolean {
  return (
    left.inputTokens === right.inputTokens &&
    left.cachedInputTokens === right.cachedInputTokens &&
    left.outputTokens === right.outputTokens &&
    left.runningMs === right.runningMs
  );
}

/**
 * Device-local floor for project usage aggregates, so archiving every workspace
 * under a project — or restarting the app — doesn't reset its token/time strip.
 * Entries are never pruned: a project that comes back under the same view key
 * keeps its history, and the payload is four numbers per project.
 */
export const useProjectUsageLedgerStore = create<ProjectUsageLedgerState>()(
  persist(
    (set) => ({
      totalsByProjectViewKey: {},
      recordProjectUsage: (projectViewKey, totals) =>
        set((state) => {
          const key = projectViewKey.trim();
          if (!key || !totals) {
            return state;
          }
          const stored = state.totalsByProjectViewKey[key];
          const merged = mergeProjectUsageTotals(stored, totals);
          if (!merged || (stored && isSameTotals(stored, merged))) {
            return state;
          }
          return {
            totalsByProjectViewKey: { ...state.totalsByProjectViewKey, [key]: merged },
          };
        }),
    }),
    {
      name: "@paseo:project-usage-ledger",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ totalsByProjectViewKey: state.totalsByProjectViewKey }),
    },
  ),
);
