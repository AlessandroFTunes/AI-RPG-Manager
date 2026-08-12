import { tool } from "ai";
import { z } from "zod";
import {
  getCampaignById,
  patchCampaignState,
  saveCampaignMessage,
} from "../db/campaignRepository";

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
      patch: z.record(z.string(), z.unknown()).describe("Patch JSON com chaves de alto nível do estado"),
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

export function createRecordImportantMemoryTool(campaignId: string) {
  return tool({
    description:
      "Registra um fato importante da campanha para memória futura. Use para NPCs, pistas, promessas, consequências e descobertas relevantes.",
    inputSchema: z.object({
      content: z.string().min(1).describe("Fato importante a lembrar"),
      tags: z.array(z.string()).optional().describe("Tags curtas para classificar a memória"),
    }),
    execute: async ({ content, tags }) => {
      await saveCampaignMessage({
        campaignId,
        role: "system",
        content,
        metadata: { type: "important_memory", tags: tags ?? [] },
      });

      return { success: true, content, tags: tags ?? [] };
    },
  });
}
