import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import { agentContextPercent, contextUsageTier } from "./sidebar-context-usage";

function withUsage(usage: Partial<NonNullable<Agent["lastUsage"]>> | undefined): Agent {
  return { lastUsage: usage } as Agent;
}

describe("agentContextPercent", () => {
  it("returns null without usable usage", () => {
    expect(agentContextPercent(withUsage(undefined))).toBeNull();
    expect(agentContextPercent(withUsage({ contextWindowUsedTokens: 100 }))).toBeNull();
    expect(agentContextPercent(withUsage({ contextWindowMaxTokens: 200 }))).toBeNull();
    expect(
      agentContextPercent(withUsage({ contextWindowMaxTokens: 0, contextWindowUsedTokens: 100 })),
    ).toBeNull();
  });

  it("rounds and clamps to 100", () => {
    expect(
      agentContextPercent(
        withUsage({ contextWindowMaxTokens: 1000, contextWindowUsedTokens: 505 }),
      ),
    ).toBe(51);
    expect(
      agentContextPercent(
        withUsage({ contextWindowMaxTokens: 1000, contextWindowUsedTokens: 2000 }),
      ),
    ).toBe(100);
  });
});

describe("contextUsageTier", () => {
  it("maps percentages onto the four color tiers", () => {
    expect(contextUsageTier(0)).toBe("low");
    expect(contextUsageTier(49)).toBe("low");
    expect(contextUsageTier(50)).toBe("medium");
    expect(contextUsageTier(74)).toBe("medium");
    expect(contextUsageTier(75)).toBe("high");
    expect(contextUsageTier(89)).toBe("high");
    expect(contextUsageTier(90)).toBe("critical");
    expect(contextUsageTier(100)).toBe("critical");
  });
});
