import { createOpenAI } from "@ai-sdk/openai";
import { env } from "../config/env";
import { createResilientModel } from "./resilientModel";

export function buildModel() {
  switch (env.AI_PROVIDER) {
    case "nvidia":
      if (!env.NVIDIA_MODEL) throw new Error("NVIDIA_MODEL is required when AI_PROVIDER=nvidia");

      const primaryModel = createOpenAI({
        apiKey: env.NVIDIA_API_KEY,
        baseURL: env.NVIDIA_BASE_URL,
      }).chat(env.NVIDIA_MODEL as never);
      const fallbackModel = env.OPENROUTER_API_KEY
        ? createOpenAI({
            apiKey: env.OPENROUTER_API_KEY,
            baseURL: "https://openrouter.ai/api/v1",
            headers: { "X-OpenRouter-Title": "Discord RPG Bot" },
          }).chat(env.OPENROUTER_MODEL as never)
        : undefined;

      return createResilientModel({ primaryModel, fallbackModel });
    case "openai":
      return createOpenAI({ apiKey: env.OPENAI_API_KEY }).chat(env.OPENAI_MODEL);
  }
}

export const model = buildModel();
