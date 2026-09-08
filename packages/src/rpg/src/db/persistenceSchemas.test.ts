import { describe, expect, test } from "bun:test";
import { parsePersistentRecord } from "./persistenceSchemas";

describe("parsePersistentRecord", () => {
  test("accepts nested JSON data", () => {
    expect(parsePersistentRecord({ result: [1, true, null, { value: "ok" }] }, "fixture"))
      .toEqual({ result: [1, true, null, { value: "ok" }] });
  });

  test("rejects values PostgreSQL JSONB cannot represent", () => {
    expect(() => parsePersistentRecord({ missing: undefined }, "fixture")).toThrow("Invalid persisted fixture");
    expect(() => parsePersistentRecord({ invalid: Number.NaN }, "fixture")).toThrow("Invalid persisted fixture");
  });
});
