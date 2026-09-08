import { describe, expect, test } from "bun:test";
import {
  MUSIC_CONTRACT_VERSION,
  isMusicRequestContext,
  parseMusicEnergy,
  parseMusicRequestContext,
  parseMusicRequestResult,
} from "../../../shared/music/contracts";

const context = {
  version: MUSIC_CONTRACT_VERSION,
  campaign: {
    title: "The Keep",
    system: "D&D 5e",
    tone: "",
    premise: "Explore",
    summary: "At the gate",
    currentScene: "Rain falls",
    characters: ["Ada"],
  },
  request: {
    mood: "ominous",
    energy: "low",
    reason: "Scene changed",
    replaceCurrent: false,
  },
  recentMessages: [{ role: "user", authorName: "Ada", content: "Open it." }],
};

describe("music contracts", () => {
  test("parses a versioned request context", () => {
    const parsed = parseMusicRequestContext(context);
    expect(parsed.version).toBe(1);
    expect(parsed.request.energy).toBe("low");
    expect(isMusicRequestContext(parsed)).toBe(true);
  });

  test("rejects unsupported versions and enum values", () => {
    expect(() => parseMusicRequestContext({ ...context, version: 2 })).toThrow("context.version");
    expect(() => parseMusicEnergy("extreme")).toThrow("energy");
  });

  test("parses a complete result", () => {
    const result = parseMusicRequestResult({
      version: MUSIC_CONTRACT_VERSION,
      plan: {
        mood: "ominous",
        energy: "low",
        tension: "high",
        sceneType: "exploration",
        youtubeQuery: "dark castle ambient",
        avoidTerms: ["lyrics"],
      },
      track: {
        title: "Castle Ambience",
        webpageUrl: "https://example.com/watch",
        streamUrl: "https://example.com/audio",
        durationSeconds: 1200,
      },
    });
    expect(result.track.durationSeconds).toBe(1200);
  });
});
