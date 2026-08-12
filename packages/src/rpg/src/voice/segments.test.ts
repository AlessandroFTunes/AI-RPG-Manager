import { describe, expect, test } from "bun:test";
import { normalizeNpcId, parseVoiceSegments } from "./segments";

describe("parseVoiceSegments", () => {
  test("separates narrator and NPC dialogue while cleaning Discord content", () => {
    const result = parseVoiceSegments([
      '<voice speaker="narrator">A porta se abre.</voice>',
      '<voice speaker="npc" id="brann" name="Brann">Não entre.</voice>',
    ].join("\n"));

    expect(result.content).toBe("A porta se abre.\n\n**Brann:** Não entre.");
    expect(result.voiceSegments).toEqual([
      { speaker: "narrator", text: "A porta se abre." },
      { speaker: "npc", npcId: "brann", name: "Brann", text: "Não entre." },
    ]);
  });

  test("uses narrator for unmarked and malformed content", () => {
    const result = parseVoiceSegments("Antes <voice speaker=\"npc\">fala sem nome</voice> depois");
    expect(result.voiceSegments.every((segment) => segment.speaker === "narrator")).toBe(true);
    expect(result.content).not.toContain("<voice");
  });

  test("removes exposed thinking blocks", () => {
    const result = parseVoiceSegments("<think>raciocínio interno</think><voice speaker=\"narrator\">Resposta.</voice>");
    expect(result.content).toBe("Resposta.");
  });
});

describe("normalizeNpcId", () => {
  test("creates stable safe identifiers", () => {
    expect(normalizeNpcId("Bränn, o Ancião! ")).toBe("brann-o-anciao");
  });
});
