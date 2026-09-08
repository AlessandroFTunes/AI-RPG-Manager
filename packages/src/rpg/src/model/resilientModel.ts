import type { LanguageModelV3, LanguageModelV3Middleware } from "@ai-sdk/provider";
import { APICallError, wrapLanguageModel } from "ai";
import { createLogger } from "../../../shared/logging/logger";

const logger = createLogger("rpg");

const NVIDIA_RETRY_DELAY_MS = 10_000;

let requestQueue = Promise.resolve();

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function enqueue<T>(task: () => PromiseLike<T>) {
  const result = requestQueue.then(task, task);
  requestQueue = result.then(() => undefined, () => undefined);
  return result;
}

function isRateLimitError(error: unknown) {
  return APICallError.isInstance(error) && error.statusCode === 429;
}

export class AIProvidersUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("Os provedores de IA estão temporariamente indisponíveis.", options);
    this.name = "AIProvidersUnavailableError";
  }
}

export function createResilientModel(input: {
  primaryModel: LanguageModelV3;
  fallbackModel?: LanguageModelV3;
  retryDelayMs?: number;
}) {
  const middleware: LanguageModelV3Middleware = {
    specificationVersion: "v3",
    wrapGenerate: ({ doGenerate, params }) => enqueue(async () => {
      try {
        return await doGenerate();
      } catch (firstError) {
        if (!isRateLimitError(firstError)) throw firstError;
        logger.warn("ai_provider_rate_limited", { provider: "nvidia", retry_delay_ms: input.retryDelayMs ?? NVIDIA_RETRY_DELAY_MS });
      }

      await wait(input.retryDelayMs ?? NVIDIA_RETRY_DELAY_MS);

      try {
        return await doGenerate();
      } catch (secondError) {
        if (!isRateLimitError(secondError)) throw secondError;
        if (!input.fallbackModel) {
          throw new AIProvidersUnavailableError({ cause: secondError });
        }

        logger.warn("ai_provider_fallback", { primary_provider: "nvidia", fallback_provider: "openrouter" });
        try {
          return await input.fallbackModel.doGenerate(params);
        } catch (fallbackError) {
          throw new AIProvidersUnavailableError({ cause: fallbackError });
        }
      }
    }),
  };

  return wrapLanguageModel({ model: input.primaryModel, middleware });
}

export function isAIProvidersUnavailableError(error: unknown) {
  return error instanceof AIProvidersUnavailableError;
}
