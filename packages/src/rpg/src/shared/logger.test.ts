import { describe, expect, test } from "bun:test";
import {
  createLogger,
  runWithLogContext,
  serializeError,
} from "../../../shared/logging/logger";

describe("structured logger", () => {
  test("writes JSON with context and stable required fields", async () => {
    const lines: string[] = [];
    const logger = createLogger("rpg", {
      now: () => new Date("2026-08-16T12:00:00.000Z"),
      write: (line) => lines.push(line),
    });

    await runWithLogContext({ campaign_id: "campaign-1" }, async () => {
      await Promise.resolve();
      logger.info("request_queued", {
        interaction_id: "interaction-1",
        duration_ms: 12,
        service: "not-allowed-to-override",
      });
    });

    expect(JSON.parse(lines[0])).toEqual({
      service: "rpg",
      event: "request_queued",
      timestamp: "2026-08-16T12:00:00.000Z",
      level: "info",
      campaign_id: "campaign-1",
      interaction_id: "interaction-1",
      duration_ms: 12,
    });
  });

  test("serializes errors and circular values safely", () => {
    const cause = new Error("database unavailable");
    const error = new Error("request failed", { cause });
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(serializeError(error)).toMatchObject({
      name: "Error",
      message: "request failed",
      cause: { name: "Error", message: "database unavailable" },
    });

    const lines: string[] = [];
    const logger = createLogger("rpg", { write: (line) => lines.push(line) });
    logger.error("failed", error, { circular });
    expect(JSON.parse(lines[0]).circular.self).toBe("[Circular]");
  });
});
