import { tool } from "ai";
import { z } from "zod";
import {
  getCampaignById,
  patchCampaignState,
  saveCampaignEvent,
  saveCampaignMessage,
} from "../db/campaignRepository";

const characterSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
});

const campaignStatePatchSchema = z.object({
  system: z.string().optional(),
  summary: z.string().optional(),
  currentScene: z.string().optional(),
  characters: z.array(characterSchema).optional(),
  npcs: z.array(characterSchema.extend({
    relationship: z.number().optional(),
    notes: z.array(z.string()).optional(),
  })).optional(),
  locations: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    visited: z.boolean().optional(),
  })).optional(),
  quests: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    status: z.enum(["active", "completed", "failed"]),
    description: z.string().optional(),
  })).optional(),
  inventory: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    quantity: z.number().int().nonnegative(),
  })).optional(),
  flags: z.record(z.string(), z.unknown()).optional(),
});

export function createReadCampaignTool(campaignId: string) {
  return tool({
    description: "Lê o estado atual da campanha de RPG no banco.",
    inputSchema: z.object({}),
    execute: async () => getCampaignById(campaignId),
  });
}

export function createUpdateCampaignStateTool(campaignId: string) {
  return tool({
    description:
      "Atualiza o estado persistente JSONB da campanha com um patch pequeno. Use apenas para mudanças relevantes e duradouras.",
    inputSchema: z.object({
      patch: campaignStatePatchSchema.describe("Patch com chaves de alto nível do estado"),
      reason: z.string().optional().describe("Por que esse estado está sendo atualizado"),
    }),
    execute: async ({ patch, reason }) => {
      const campaign = await patchCampaignState(campaignId, patch);
      return { success: Boolean(campaign), reason, state: campaign?.state ?? null };
    },
  });
}

export function createAskPlayersTool(campaignId: string) {
  return tool({
    description:
      "Registra uma pergunta que deve ser feita aos jogadores quando faltar uma decisão essencial antes de continuar.",
    inputSchema: z.object({
      question: z.string().min(1).describe("Pergunta objetiva para os jogadores"),
      options: z.array(z.string()).optional().describe("Opções sugeridas, se houver"),
    }),
    execute: async ({ question, options }) => {
      await saveCampaignMessage({
        campaignId,
        role: "system",
        content: question,
        metadata: { type: "ask_players", options: options ?? [] },
      });

      return {
        success: true,
        instruction: "Faça esta pergunta diretamente aos jogadores e aguarde a resposta deles antes de avançar a cena.",
        question,
        options: options ?? [],
      };
    },
  });
}

export function createRecordImportantMemoryTool(campaignId: string, actorId?: string) {
  return tool({
    description:
      "Registra um fato importante da campanha para memória futura. Use para NPCs, pistas, promessas, consequências e descobertas relevantes.",
    inputSchema: z.object({
      content: z.string().min(1).describe("Fato importante a lembrar"),
      tags: z.array(z.string()).optional().describe("Tags curtas para classificar a memória"),
      importance: z.number().int().min(1).max(5).default(3),
    }),
    execute: async ({ content, tags, importance }) => {
      await saveCampaignEvent({
        campaignId,
        type: "important_memory",
        actorId,
        data: { content, tags: tags ?? [] },
        importance,
      });

      return { success: true, content, tags: tags ?? [], importance };
    },
  });
}
