import { afterEach, describe, expect, test } from "bun:test";
import { clearDndRulesCache, searchDndRules } from "./dnd5eApi";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearDndRulesCache();
});

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("searchDndRules", () => {
  test("returns the closest 2014 match and its source", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("?name=Fireball")) {
        return jsonResponse({
          count: 2,
          results: [
            { index: "delayed-blast-fireball", name: "Delayed Blast Fireball", url: "/api/2014/spells/delayed-blast-fireball" },
            { index: "fireball", name: "Fireball", url: "/api/2014/spells/fireball" },
          ],
        });
      }
      return jsonResponse({ name: "Fireball", level: 3, range: "150 feet", damage: "8d6" });
    }) as typeof fetch;

    const result = await searchDndRules({
      ruleset: "dnd5e-2014",
      category: "spells",
      query: "Fireball",
    });

    expect(result).toMatchObject({
      found: true,
      requestedEdition: "2014",
      sourceEdition: "2014",
      fallback: false,
      name: "Fireball",
    });
    expect(result.source).toContain("8d6");
    expect(requests[1]).toEndWith("/api/2014/spells/fireball");
  });

  test("caches API responses for repeated searches", async () => {
    let requestCount = 0;
    globalThis.fetch = (async (input) => {
      requestCount += 1;
      return String(input).includes("?name=")
        ? jsonResponse({
            count: 1,
            results: [{ index: "grappled", name: "Grappled", url: "/api/2014/conditions/grappled" }],
          })
        : jsonResponse({ name: "Grappled", desc: ["Speed 0"] });
    }) as typeof fetch;

    const input = { ruleset: "dnd5e-2014" as const, category: "conditions" as const, query: "Grappled" };
    await searchDndRules(input);
    await searchDndRules(input);

    expect(requestCount).toBe(2);
  });

  test("falls back from an unavailable 2024 category to 2014", async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("/api/2024/spells")) return jsonResponse({}, 404);
      if (url.includes("?name=Fireball")) {
        return jsonResponse({
          count: 1,
          results: [{ index: "fireball", name: "Fireball", url: "/api/2014/spells/fireball" }],
        });
      }
      return jsonResponse({ name: "Fireball", level: 3 });
    }) as typeof fetch;

    const result = await searchDndRules({
      ruleset: "dnd5e-2024",
      category: "spells",
      query: "Fireball",
    });

    expect(result).toMatchObject({
      found: true,
      requestedEdition: "2024",
      sourceEdition: "2014",
      fallback: true,
      name: "Fireball",
    });
    expect(result.fallbackReason).toContain("não está disponível");
    expect(requests.some((url) => url.includes("/api/2014/spells"))).toBe(true);
  });
});
