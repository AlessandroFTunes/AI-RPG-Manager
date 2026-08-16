import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { env } from "../config/env";
import type { Campaign, MusicRequest } from "../db/repository";
import type { AmbientPlan } from "./types";

const ambientPlanSchema = z.object({
  mood: z.string().min(1),
  energy: z.enum(["low", "medium", "high"]),
  tension: z.enum(["low", "medium", "high"]),
  sceneType: z.string().min(1),
  youtubeQuery: z.string().min(1),
  avoidTerms: z.array(z.string()).default(["lyrics", "vocals", "cover", "live", "feat"]),
});

function readRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function toFallbackQuery(parts: string[]) {
  const query = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return `${query || "fantasy ambient"} instrumental ambient no vocals no lyrics`;
}

function buildFallbackPlan(campaign: Campaign, request: MusicRequest): AmbientPlan {
  const context = readRecord(request.context);
  const campaignContext = readRecord(context.campaign);
  const requestContext = readRecord(context.request);
  return {
    mood: readString(requestContext.mood) || readString(campaignContext.tone) || "cinematic ambient",
    energy: "low",
    tension: "medium",
    sceneType: readString(requestContext.sceneType) || "scene",
    youtubeQuery: toFallbackQuery([
      readString(request.indication),
      readString(campaignContext.themeHint),
      readString(campaign.system),
      readString(campaignContext.tone),
      readString(campaignContext.currentScene),
    ]),
    avoidTerms: ["lyrics", "vocals", "cover", "live", "feat", "song"],
  };
}

export async function generateAmbientPlan(campaign: Campaign, request: MusicRequest) {
  const context = readRecord(request.context);
  const apiKey = env.MUSIC_OPENROUTER_API_KEY ?? env.OPENROUTER_API_KEY;
  const model = createOpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    headers: { "X-OpenRouter-Title": "Discord Ambient Music Bot" },
  }).chat(env.MUSIC_OPENROUTER_MODEL as never);

  const recentMessages = Array.isArray(context.recentMessages) ? context.recentMessages : [];

  try {
    const result = await generateObject({
      model,
      schema: ambientPlanSchema,
      system: [
        "Você cria buscas curtas para trilha sonora instrumental no YouTube.",
        "Use sempre termos voltados a ambience, ambient, soundtrack ou background music.",
        "Nunca gere música com voz, cantor, rap, pop, cover ou live.",
        "A query final deve estar em inglês e terminar com termos como instrumental, ambient, no vocals, no lyrics.",
        "Prefira atmosfera consistente a novidade.",
      ].join(" "),
      prompt: JSON.stringify({
        campaign: {
          title: campaign.title,
          system: campaign.system,
          tone: campaign.state.setup.tone,
          summary: campaign.state.summary,
          currentScene: campaign.state.currentScene,
        },
        request: {
          indication: request.indication,
          reason: request.reason,
          replaceCurrent: request.replace_current,
          source: request.source,
        },
        context,
        recentMessages,
      }),
    });

    return result.object;
  } catch {
    return buildFallbackPlan(campaign, request);
  }
}
