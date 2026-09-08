import { tool } from "ai";
import { z } from "zod";
import {
  adjustCampaignRelationship,
  advanceCampaignWorldClock,
  changeCampaignInventory,
  getCampaignById,
  patchCampaignSetup,
  saveCampaignEvent,
  saveCampaignMessage,
  updateCampaignNarrative,
  upsertCampaignLocation,
  upsertCampaignNpc,
  upsertCampaignQuest,
  upsertPlayerCharacter,
} from "../db/campaignRepository";
import { queueAmbientMusicRequest } from "../music/ambientRequest";
import {
  getNarrativeRelationshipView,
  relationshipEntityTypes,
} from "../relationships/relationships";
import { formatWorldClock } from "../world/worldClock";

const sessionZeroPatchSchema = z.object({
  premise: z.string().optional(),
  tone: z.string().optional(),
  boundaries: z.array(z.string()).optional(),
});

const relationshipPartySchema = z.object({
  type: z.enum(relationshipEntityTypes),
  id: z.string().min(1),
  name: z.string().min(1),
});

const relationshipDeltasSchema = z.object({
  trust: z.number().int().min(-25).max(25).optional(),
  friendship: z.number().int().min(-25).max(25).optional(),
  fear: z.number().int().min(-25).max(25).optional(),
  respect: z.number().int().min(-25).max(25).optional(),
  romance: z.number().int().min(-25).max(25).optional(),
  resentment: z.number().int().min(-25).max(25).optional(),
  debt: z.number().int().min(-25).max(25).optional(),
}).refine(
  (deltas) => Object.values(deltas).some((delta) => delta !== undefined && delta !== 0),
  { message: "Informe ao menos uma mudança diferente de zero." },
);

const worldDurationSchema = z.object({
  days: z.number().int().min(0).max(365).optional(),
  hours: z.number().int().min(0).max(23).optional(),
  minutes: z.number().int().min(0).max(59).optional(),
}).refine(
  (duration) => Object.values(duration).some((value) => value !== undefined && value > 0),
  { message: "Informe uma duração maior que zero." },
);

export function createReadCampaignTool(campaignId: string) {
  return tool({
    description: "Lê o estado atual da campanha. Relacionamentos são apresentados sem números ocultos.",
    inputSchema: z.object({}),
    execute: async () => {
      const campaign = await getCampaignById(campaignId);
      if (!campaign) return null;

      return {
        ...campaign,
        state: {
          ...campaign.state,
          relationships: campaign.state.relationships.map(getNarrativeRelationshipView),
        },
      };
    },
  });
}

export function createAdjustRelationshipTool(campaignId: string, actorId?: string) {
  return tool({
    description:
      "Registra uma mudança duradoura e direcional no relacionamento de uma entidade para outra. Use somente como consequência de um acontecimento concreto. Os valores são ocultos dos jogadores.",
    inputSchema: z.object({
      source: relationshipPartySchema.describe("Quem passou a sentir ou pensar de forma diferente"),
      target: relationshipPartySchema.describe("A entidade que provocou ou recebeu essa mudança"),
      deltas: relationshipDeltasSchema.describe("Mudanças pequenas; sinais positivos aumentam a dimensão"),
      reason: z.string().min(3).max(300).describe("Acontecimento concreto que causou a mudança"),
    }),
    execute: async ({ source, target, deltas, reason }) => {
      const relationship = await adjustCampaignRelationship({
        campaignId,
        actorId,
        source,
        target,
        deltas,
        reason,
      });

      return relationship
        ? { success: true, relationship: getNarrativeRelationshipView(relationship), reason }
        : { success: false, reason: "Campanha não encontrada." };
    },
  });
}

export function createAdvanceWorldTimeTool(campaignId: string, actorId?: string) {
  return tool({
    description:
      "Avança de forma determinística a data e a hora da campanha. Use uma vez após uma ação, descanso, espera ou deslocamento que consuma tempo relevante; não use para ações instantâneas.",
    inputSchema: z.object({
      duration: worldDurationSchema,
      reason: z.string().min(3).max(300).describe("Ação ou acontecimento que consumiu esse tempo"),
    }),
    execute: async ({ duration, reason }) => {
      const result = await advanceCampaignWorldClock({
        campaignId,
        actorId,
        duration,
        reason,
      });
      if (!result) return { success: false, reason: "Campanha não encontrada." };

      return {
        success: true,
        before: formatWorldClock(result.before),
        after: formatWorldClock(result.after),
        duration,
        reason,
      };
    },
  });
}

export function createUpdateNarrativeTool(campaignId: string, actorId?: string) {
  return tool({
    description:
      "Atualiza somente o resumo e/ou a descrição da cena atual. Não use para NPCs, locais, missões ou inventário.",
    inputSchema: z.object({
      summary: z.string().max(2_000).optional(),
      currentScene: z.string().max(1_000).optional(),
      reason: z.string().min(3).max(300),
    }).refine((value) => value.summary !== undefined || value.currentScene !== undefined, {
      message: "Informe resumo ou cena atual.",
    }),
    execute: async ({ summary, currentScene, reason }) => {
      const campaign = await updateCampaignNarrative({
        campaignId, actorId, summary, currentScene, reason,
      });
      return { success: Boolean(campaign), summary, currentScene, reason };
    },
  });
}

export function createUpsertNpcTool(campaignId: string, actorId?: string) {
  return tool({
    description: "Cria ou atualiza um NPC persistente usando seu id estável.",
    inputSchema: z.object({
      npc: z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        status: z.string().optional(),
        notes: z.array(z.string()).optional(),
      }),
      reason: z.string().min(3).max(300),
    }),
    execute: async ({ npc, reason }) => ({
      success: Boolean(await upsertCampaignNpc({ campaignId, actorId, npc, reason })),
      npc,
      reason,
    }),
  });
}

export function createUpsertLocationTool(campaignId: string, actorId?: string) {
  return tool({
    description: "Cria ou atualiza um local persistente usando seu id estável.",
    inputSchema: z.object({
      location: z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        visited: z.boolean().optional(),
      }),
      reason: z.string().min(3).max(300),
    }),
    execute: async ({ location, reason }) => ({
      success: Boolean(await upsertCampaignLocation({ campaignId, actorId, location, reason })),
      location,
      reason,
    }),
  });
}

export function createUpsertQuestTool(campaignId: string, actorId?: string) {
  return tool({
    description: "Cria ou atualiza uma missão persistente usando seu id estável.",
    inputSchema: z.object({
      quest: z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        status: z.enum(["active", "completed", "failed"]),
        description: z.string().optional(),
      }),
      reason: z.string().min(3).max(300),
    }),
    execute: async ({ quest, reason }) => ({
      success: Boolean(await upsertCampaignQuest({ campaignId, actorId, quest, reason })),
      quest,
      reason,
    }),
  });
}

export function createChangeInventoryTool(campaignId: string, actorId?: string) {
  return tool({
    description: "Adiciona ou remove uma quantidade de um item sem substituir o inventário completo.",
    inputSchema: z.object({
      item: z.object({ id: z.string().min(1), name: z.string().min(1) }),
      quantityDelta: z.number().int().min(-10_000).max(10_000).refine((value) => value !== 0),
      reason: z.string().min(3).max(300),
    }),
    execute: async ({ item, quantityDelta, reason }) => ({
      success: Boolean(await changeCampaignInventory({
        campaignId, actorId, item, quantityDelta, reason,
      })),
      item,
      quantityDelta,
      reason,
    }),
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
