import { describe, expect, test } from "bun:test";
import {
  adjustRelationships,
  getNarrativeRelationshipView,
  type RelationshipParty,
} from "./relationships";

const lyra: RelationshipParty = { type: "npc", id: "lyra", name: "Lyra" };
const alessandro: RelationshipParty = {
  type: "character",
  id: "player-1",
  name: "Alessandro",
};

describe("adjustRelationships", () => {
  test("creates a directional relationship with neutral baselines", () => {
    const result = adjustRelationships([], {
      source: lyra,
      target: alessandro,
      deltas: { trust: 10, friendship: 5 },
      now: "2026-08-16T12:00:00.000Z",
    });

    expect(result.relationship.id).toBe("npc:lyra->character:player-1");
    expect(result.relationship.scores).toEqual({
      trust: 60,
      friendship: 5,
      fear: 0,
      respect: 50,
      romance: 0,
      resentment: 0,
      debt: 0,
    });
    expect(result.relationship.updatedAt).toBe("2026-08-16T12:00:00.000Z");
  });

  test("does not change the inverse direction", () => {
    const first = adjustRelationships([], {
      source: lyra,
      target: alessandro,
      deltas: { trust: 20 },
    });
    const second = adjustRelationships(first.relationships, {
      source: alessandro,
      target: lyra,
      deltas: { resentment: 10 },
    });

    expect(second.relationships).toHaveLength(2);
    expect(second.relationships[0].scores.trust).toBe(70);
    expect(second.relationship.scores.trust).toBe(50);
    expect(second.relationship.scores.resentment).toBe(10);
  });

  test("accumulates changes and clamps every score between zero and one hundred", () => {
    const first = adjustRelationships([], {
      source: lyra,
      target: alessandro,
      deltas: { trust: 100, fear: 100 },
    });
    const second = adjustRelationships(first.relationships, {
      source: lyra,
      target: alessandro,
      deltas: { trust: 50, respect: -100 },
    });

    expect(second.relationship.scores.trust).toBe(100);
    expect(second.relationship.scores.fear).toBe(100);
    expect(second.relationship.scores.respect).toBe(0);
  });

  test("rejects self relationships", () => {
    expect(() => adjustRelationships([], {
      source: lyra,
      target: lyra,
      deltas: { trust: 1 },
    })).toThrow("não pode ter relacionamento consigo mesma");
  });
});

describe("getNarrativeRelationshipView", () => {
  test("returns behavior guidance without hidden scores", () => {
    const { relationship } = adjustRelationships([], {
      source: lyra,
      target: alessandro,
      deltas: { trust: 40, friendship: 70, fear: 30, debt: 60 },
    });
    const view = getNarrativeRelationshipView(relationship);

    expect(view.attitudes).toContain("confia plenamente");
    expect(view.attitudes).toContain("sente amizade");
    expect(view.attitudes).toContain("age com receio");
    expect(view.attitudes).toContain("sente uma grande dívida");
    expect(JSON.stringify(view)).not.toContain("scores");
    expect(JSON.stringify(view)).not.toContain("90");
  });
});
