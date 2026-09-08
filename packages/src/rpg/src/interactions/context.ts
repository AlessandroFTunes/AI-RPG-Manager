import { AsyncLocalStorage } from "node:async_hooks";

type InteractionContext = {
  id: string;
  counters: Map<string, number>;
};

const storage = new AsyncLocalStorage<InteractionContext>();

export function runWithInteractionContext<T>(interactionId: string, callback: () => T): T {
  return storage.run({ id: interactionId, counters: new Map() }, callback);
}

export function nextInteractionEffect(effectType: string) {
  const context = storage.getStore();
  if (!context) return { interactionId: null, operationKey: null };
  const ordinal = context.counters.get(effectType) ?? 0;
  context.counters.set(effectType, ordinal + 1);
  return {
    interactionId: context.id,
    operationKey: `${effectType}:${ordinal}`,
  };
}
