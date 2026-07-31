import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  type AgentDoneState,
  mergePersistedAgentDone,
  serializeAgentDone,
  setAgentManuallyDone,
} from "./state";

export { agentDoneKey } from "./state";

interface AgentDoneStore extends AgentDoneState {
  setManuallyDone: (key: string, done: boolean) => void;
}

export const useAgentDoneStore = create<AgentDoneStore>()(
  persist(
    (set) => ({
      manuallyDoneAgentKeys: new Set(),
      setManuallyDone: (key, done) => set((state) => setAgentManuallyDone(state, key, done)),
    }),
    {
      name: "agent-done-overrides",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => serializeAgentDone(state),
      merge: (persistedState, currentState) =>
        mergePersistedAgentDone(
          persistedState as { manuallyDoneAgentKeys?: unknown } | undefined,
          currentState,
        ),
    },
  ),
);
