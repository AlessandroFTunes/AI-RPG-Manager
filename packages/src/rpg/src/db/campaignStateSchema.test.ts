import { describe, expect, test } from "bun:test";
import { createInitialCampaignState } from "./campaignRepository";
import { parseCampaignState } from "./campaignStateSchema";

describe("campaignStateSchema", () => {
  test("accepts a complete initial state", () => {
    expect(parseCampaignState(createInitialCampaignState("fantasia", "narrative")).stateVersion).toBe(1);
  });

  test("rejects unknown top-level fields", () => {
    const state = { ...createInitialCampaignState("fantasia", "narrative"), unexpected: true };
    expect(() => parseCampaignState(state, "campaign-1")).toThrow("Unrecognized key");
  });

  test("rejects invalid nested values", () => {
    const state = createInitialCampaignState("fantasia", "narrative");
    state.inventory.push({ id: "coin", name: "Moeda", quantity: -1 });
    expect(() => parseCampaignState(state, "campaign-1")).toThrow("inventory.0.quantity");
  });

  test("validates dates against the embedded calendar", () => {
    const state = createInitialCampaignState("fantasia", "narrative");
    state.worldClock.month = 99;
    expect(() => parseCampaignState(state, "campaign-1")).toThrow("worldClock.month");
  });
});
