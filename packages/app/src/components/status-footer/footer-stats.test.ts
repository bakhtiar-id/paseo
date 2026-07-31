import { describe, expect, it } from "vitest";
import type { AgentStateBucketInput } from "@getpaseo/protocol/agent-state-bucket";
import type { ProviderUsage, ProviderUsageWindow } from "@/provider-usage/types";
import { countAgentsByBucket, summarizeHosts, footerUsageWindows } from "./footer-stats";

function agent(overrides: Partial<AgentStateBucketInput> = {}): AgentStateBucketInput {
  return { status: "idle", pendingPermissionCount: 0, requiresAttention: false, ...overrides };
}

function usage(windows: ProviderUsageWindow[]): ProviderUsage {
  return {
    providerId: "claude",
    displayName: "Claude",
    status: "available",
    windows,
  } as ProviderUsage;
}

function usageWindow(overrides: Partial<ProviderUsageWindow>): ProviderUsageWindow {
  return { id: "w", label: "Window", ...overrides } as ProviderUsageWindow;
}

describe("countAgentsByBucket", () => {
  it("returns nothing for an empty list", () => {
    expect(countAgentsByBucket([])).toEqual({ buckets: [], total: 0 });
  });

  it("groups everything idle under done", () => {
    expect(countAgentsByBucket([agent(), agent()])).toEqual({
      buckets: [{ bucket: "done", count: 2 }],
      total: 2,
    });
  });

  it("orders mixed buckets by STATUS_BUCKET_ORDER and skips empty ones", () => {
    const result = countAgentsByBucket([
      agent({ status: "running" }),
      agent({ status: "running" }),
      agent({ pendingPermissionCount: 1 }),
      agent({ requiresAttention: true }),
      agent(),
    ]);
    expect(result.total).toBe(5);
    expect(result.buckets).toEqual([
      { bucket: "needs_input", count: 1 },
      { bucket: "attention", count: 1 },
      { bucket: "running", count: 2 },
      { bucket: "done", count: 1 },
    ]);
  });
});

describe("summarizeHosts", () => {
  it("counts every host online", () => {
    const statuses = new Map([
      ["a", "online" as const],
      ["b", "online" as const],
    ]);
    expect(summarizeHosts(["a", "b"], statuses)).toEqual({
      online: 2,
      total: 2,
      hasProblem: false,
    });
  });

  it("flags a problem when one host is offline", () => {
    const statuses = new Map([
      ["a", "online" as const],
      ["b", "offline" as const],
    ]);
    expect(summarizeHosts(["a", "b"], statuses)).toEqual({
      online: 1,
      total: 2,
      hasProblem: true,
    });
  });

  it("treats a still-connecting host as neither online nor a problem", () => {
    const statuses = new Map([["a", "connecting" as const]]);
    expect(summarizeHosts(["a"], statuses)).toEqual({ online: 0, total: 1, hasProblem: false });
  });

  it("flags errored hosts", () => {
    const statuses = new Map([["a", "error" as const]]);
    expect(summarizeHosts(["a"], statuses)).toEqual({ online: 0, total: 1, hasProblem: true });
  });
});

describe("footerUsageWindows", () => {
  it("returns nothing when the provider has no windows", () => {
    expect(footerUsageWindows(usage([]))).toEqual([]);
  });

  it("skips windows with no resolvable percentage", () => {
    expect(footerUsageWindows(usage([usageWindow({ id: "w1" })]))).toEqual([]);
  });

  it("derives remaining from usedPct", () => {
    const result = footerUsageWindows(usage([usageWindow({ id: "w1", usedPct: 30 })]));
    expect(result[0]?.remainingPct).toBe(70);
  });

  it("sorts most constrained (lowest remaining) first", () => {
    const result = footerUsageWindows(
      usage([
        usageWindow({ id: "w1", usedPct: 20 }),
        usageWindow({ id: "w2", remainingPct: 5 }),
        usageWindow({ id: "w3", usedPct: 60 }),
      ]),
    );
    expect(result.map((row) => [row.window.id, row.remainingPct])).toEqual([
      ["w2", 5],
      ["w3", 40],
      ["w1", 80],
    ]);
  });

  it("prefers remainingPct over usedPct on the same window", () => {
    const result = footerUsageWindows(
      usage([usageWindow({ id: "w1", usedPct: 10, remainingPct: 10 })]),
    );
    expect(result[0]?.remainingPct).toBe(10);
  });
});
