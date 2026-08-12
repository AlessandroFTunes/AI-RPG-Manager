import { describe, expect, test } from "bun:test";
import { updateVoiceCast, type VoiceCastMember } from "./campaignRepository";

describe("updateVoiceCast", () => {
  test("keeps a stable profile and promotes on the fifth appearance", () => {
    let cast: Record<string, VoiceCastMember> = {};
    for (let appearance = 1; appearance <= 5; appearance += 1) {
      cast = updateVoiceCast(cast, [{ npcId: "brann", name: "Brann" }]);
      expect(cast.brann.appearances).toBe(appearance);
    }

    const profile = cast.brann.profile;
    expect(cast.brann.importance).toBe("main");
    cast = updateVoiceCast(cast, [{ npcId: "brann", name: "Brann Renomeado" }]);
    expect(cast.brann.profile).toBe(profile);
    expect(cast.brann.name).toBe("Brann");
  });

  test("counts an NPC only once per response", () => {
    const cast = updateVoiceCast({}, [
      { npcId: "brann", name: "Brann" },
      { npcId: "brann", name: "Brann" },
    ]);
    expect(cast.brann.appearances).toBe(1);
  });
});
