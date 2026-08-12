import { createOpenAI } from "@ai-sdk/openai";
import { env } from "../config/env";

export function buildModel() {
  switch (env.AI_PROVIDER) {
    case "nvidia":
      if (!env.NVIDIA_MODEL) throw new Error("NVIDIA_MODEL is required when AI_PROVIDER=nvidia");

      return createOpenAI({
        apiKey: env.NVIDIA_API_KEY,
        baseURL: env.NVIDIA_BASE_URL,
      }).chat(env.NVIDIA_MODEL as never);
    case "openai":
      return createOpenAI({ apiKey: env.OPENAI_API_KEY }).chat(env.OPENAI_MODEL);
  }
}

export const model = buildModel();
