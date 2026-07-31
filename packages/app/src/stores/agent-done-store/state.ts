export interface AgentDoneState {
  manuallyDoneAgentKeys: Set<string>;
}

export interface PersistedAgentDone {
  manuallyDoneAgentKeys?: unknown;
}

export function agentDoneKey(serverId: string, agentId: string): string {
  return `${serverId}:${agentId}`;
}

export function setAgentManuallyDone(
  state: AgentDoneState,
  key: string,
  done: boolean,
): AgentDoneState {
  const next = new Set(state.manuallyDoneAgentKeys);
  if (done) {
    next.add(key);
  } else {
    next.delete(key);
  }
  return { ...state, manuallyDoneAgentKeys: next };
}

export function serializeAgentDone(state: AgentDoneState): { manuallyDoneAgentKeys: string[] } {
  return { manuallyDoneAgentKeys: Array.from(state.manuallyDoneAgentKeys) };
}

export function mergePersistedAgentDone<S extends AgentDoneState>(
  persisted: PersistedAgentDone | undefined,
  current: S,
): S {
  if (!Array.isArray(persisted?.manuallyDoneAgentKeys)) {
    return current;
  }
  const restored = new Set(
    persisted.manuallyDoneAgentKeys.filter((key): key is string => typeof key === "string"),
  );
  if (
    restored.size === current.manuallyDoneAgentKeys.size &&
    [...restored].every((key) => current.manuallyDoneAgentKeys.has(key))
  ) {
    return current;
  }
  return { ...current, manuallyDoneAgentKeys: restored };
}
