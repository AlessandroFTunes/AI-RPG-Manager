import { describe, expect, test } from "bun:test";
import { nextInteractionEffect, runWithInteractionContext } from "./context";

describe("interaction effect context", () => {
  test("creates deterministic operation keys per effect type", () => {
    const effects = runWithInteractionContext("interaction-1", () => [
      nextInteractionEffect("dice"),
      nextInteractionEffect("event"),
      nextInteractionEffect("dice"),
    ]);

    expect(effects).toEqual([
      { interactionId: "interaction-1", operationKey: "dice:0" },
      { interactionId: "interaction-1", operationKey: "event:0" },
      { interactionId: "interaction-1", operationKey: "dice:1" },
    ]);
  });

  test("returns nullable identity outside an interaction", () => {
    expect(nextInteractionEffect("dice")).toEqual({ interactionId: null, operationKey: null });
  });
});
