import { tool } from "ai";
import { z } from "zod";
import {
  getCampaignById,
  patchCampaignState,
  patchCampaignSetup,
  saveCampaignEvent,
  saveCampaignMessage,
  upsertPlayerCharacter,
} from "../db/campaignRepository";
import { queueAmbientMusicRequest } from "../music/ambientRequest";

const characterSchema = z.object({
  id: z.string().min(1),
  playerId: z.string().optional(),
  playerName: z.string().optional(),
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

const sessionZeroPatchSchema = z.object({
  premise: z.string().optional(),
  tone: z.string().optional(),
  boundaries: z.array(z.string()).optional(),
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

export function createRequestAmbientMusicTool(campaignId: string, actorId?: string) {
  return tool({
    description:
      "Pede ao bot de música um ambiente instrumental sem voz com base na cena atual. Use quando a aventura começar ou quando houver uma mudança clara de clima, local ou tensão. Não use em toda resposta.",
    inputSchema: z.object({
      reason: z.string().min(1).describe("Por que a cena precisa de um novo ambiente agora"),
      indication: z.string().optional().describe("Indicação curta extra para o tema musical desejado"),
      sceneType: z.string().optional().describe("Tipo de cena, como exploração, taverna, ritual ou combate"),
      mood: z.string().optional().describe("Clima dominante da trilha, como sombrio, calmo, místico ou tenso"),
      energy: z.enum(["low", "medium", "high"]).optional(),
      replaceCurrent: z.boolean().default(false).describe("Troque a trilha atual imediatamente apenas em mudanças fortes de cena"),
    }),
    execute: async ({ reason, indication, sceneType, mood, energy, replaceCurrent }) => {
      const campaign = await getCampaignById(campaignId);
      if (!campaign) {
        return { success: false, queued: false, skipped: "campaign_missing" };
      }

      return queueAmbientMusicRequest(campaign, {
        requestedBy: actorId,
        source: "auto",
        indication,
        sceneType,
        mood,
        energy,
        reason,
        replaceCurrent,
      });
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

export function createUpdateSessionZeroTool(campaignId: string) {
  return tool({
    description:
      "Registra preferências confirmadas pelos jogadores para a sessão zero. Não invente respostas que eles ainda não deram.",
    inputSchema: z.object({ patch: sessionZeroPatchSchema }),
    execute: async ({ patch }) => {
      const campaign = await patchCampaignSetup(campaignId, patch);
      if (!campaign) {
        return { success: false, reason: "A campanha não está em preparação." };
      }

      return { success: true, setup: campaign.state.setup };
    },
  });
}

export function createSavePlayerCharacterTool(
  campaignId: string,
  player: { id: string; name: string },
) {
  return tool({
    description:
      "Cria ou atualiza somente o personagem do jogador que enviou a mensagem. Use quando nome e conceito estiverem claros.",
    inputSchema: z.object({
      name: z.string().min(1).describe("Nome do personagem"),
      description: z.string().min(1).describe("Conceito, aparência, origem e capacidades já informadas"),
      status: z.string().optional().describe("Condição inicial relevante"),
    }),
    execute: async ({ name, description, status }) => {
      const character = {
        id: `player-${player.id}`,
        playerId: player.id,
        playerName: player.name,
        name,
        description,
        ...(status ? { status } : {}),
      };
      const updated = await upsertPlayerCharacter(campaignId, character);

      return updated
        ? { success: true, character }
        : { success: false, reason: "A campanha não está em preparação." };
    },
  });
}
