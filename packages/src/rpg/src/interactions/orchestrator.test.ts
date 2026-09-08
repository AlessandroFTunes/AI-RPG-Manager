import { describe, expect, test } from "bun:test";
import { campaignLockKey, guildCreationLockKey } from "./orchestrator";

describe("interaction lock keys", () => {
  test("namespaces campaign and guild locks", () => {
    expect(campaignLockKey("abc")).toBe("rpg:campaign:abc");
    expect(guildCreationLockKey("abc")).toBe("rpg:guild-campaign-create:abc");
    expect(campaignLockKey("abc")).not.toBe(guildCreationLockKey("abc"));
  });
});
