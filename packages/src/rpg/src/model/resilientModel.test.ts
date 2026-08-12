import { describe, expect, test } from "bun:test";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { APICallError } from "ai";
import { createResilientModel } from "./resilientModel";

function rateLimitError() {
  return new APICallError({
    message: "Too Many Requests",
    url: "https://example.com/chat",
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: true,
  });
}

function fakeModel(provider: string, generate: LanguageModelV3["doGenerate"]): LanguageModelV3 {
  return {
    specificationVersion: "v3",
    provider,
    modelId: `${provider}-model`,
    supportedUrls: {},
    doGenerate: generate,
    doStream: () => Promise.reject(new Error("Streaming is not used")),
  };
}

describe("createResilientModel", () => {
  test("retries the primary model once after a rate limit", async () => {
    let attempts = 0;
    const expected = { content: [], finishReason: { unified: "stop", raw: "stop" }, usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined } };
    const primaryModel = fakeModel("primary", async () => {
      attempts += 1;
      if (attempts === 1) throw rateLimitError();
      return expected as never;
    });
    const model = createResilientModel({ primaryModel, retryDelayMs: 0 });

    const result = await model.doGenerate({} as never);

    expect(result).toBe(expected as never);
    expect(attempts).toBe(2);
  });

  test("falls back after two primary rate limits", async () => {
    let primaryAttempts = 0;
    let fallbackAttempts = 0;
    const expected = { content: [], finishReason: { unified: "stop", raw: "stop" }, usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined } };
    const primaryModel = fakeModel("primary", async () => {
      primaryAttempts += 1;
      throw rateLimitError();
    });
    const fallbackModel = fakeModel("fallback", async () => {
      fallbackAttempts += 1;
      return expected as never;
    });
    const model = createResilientModel({ primaryModel, fallbackModel, retryDelayMs: 0 });

    const result = await model.doGenerate({} as never);

    expect(result).toBe(expected as never);
    expect(primaryAttempts).toBe(2);
    expect(fallbackAttempts).toBe(1);
  });

  test("does not retry non-rate-limit errors", async () => {
    let attempts = 0;
    const primaryModel = fakeModel("primary", async () => {
      attempts += 1;
      throw new Error("Invalid request");
    });
    const model = createResilientModel({ primaryModel, retryDelayMs: 0 });

    await expect(model.doGenerate({} as never)).rejects.toThrow("Invalid request");
    expect(attempts).toBe(1);
  });
});
