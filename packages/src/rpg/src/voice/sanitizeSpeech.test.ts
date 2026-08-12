import { describe, expect, test } from "bun:test";
import { compactSpeechQueue, sanitizeSpeechText } from "./sanitizeSpeech";

describe("sanitizeSpeechText", () => {
  test("removes Discord and Markdown syntax", () => {
    expect(sanitizeSpeechText("**Ataque!** Veja `1d20+3` em https://example.com <@123>"))
      .toBe("Ataque! Veja 1 dado de 20 mais 3 em");
  });

  test("removes fenced code blocks", () => {
    expect(sanitizeSpeechText("Antes```json\n{\"x\":1}\n```Depois")).toBe("Antes Depois");
  });
});

describe("compactSpeechQueue", () => {
  test("joins pending narration in order", () => {
    expect(compactSpeechQueue(["Primeira cena.", "Segunda cena."]))
      .toBe("Primeira cena. Em seguida, Segunda cena.");
  });
});
