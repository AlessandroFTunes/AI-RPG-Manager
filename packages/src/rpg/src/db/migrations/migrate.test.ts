import { describe, expect, test } from "bun:test";
import { calculateChecksum, parseMigrationFileName } from "../migrate";

describe("SQL migrations", () => {
  test("parses immutable ordered migration filenames", () => {
    expect(parseMigrationFileName("0002_phase_0_foundation.sql")).toEqual({
      version: 2,
      name: "phase_0_foundation",
    });
    expect(parseMigrationFileName("2_phase.sql")).toBeNull();
    expect(parseMigrationFileName("0002_Phase.sql")).toBeNull();
  });

  test("calculates SHA-256 checksums", () => {
    expect(calculateChecksum("migration\n")).toBe(
      "40cef42f146406268fce98d2a44ba598a28c7fcabe3b4491f6461b557ee34d7d",
    );
  });
});
