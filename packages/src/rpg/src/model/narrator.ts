import { generateText, stepCountIs, type ModelMessage } from "ai";
import type { Campaign, CampaignEvent, CampaignMessage } from "../db/campaignRepository";
import { updateCampaignNarrative } from "../db/campaignRepository";
import { createSetupTools, createTools } from "../tools";
import { buildCampaignSystemPrompt, buildSetupSystemPrompt, promptBase } from "./promptBase";
import { model } from "./provider";
import { parseVoiceSegments } from "../voice/segments";
import { getNarrativeRelationshipView } from "../relationships/relationships";

type NarrateInput = {
  campaign: Campaign;
  recentMessages: CampaignMessage[];
  recentEvents: CampaignEvent[];
  authorId: string;
};

function toModelMessages(messages: CampaignMessage[]): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;

    const content = message.role === "user" && message.author_name
      ? `${message.author_name}: ${message.content}`
      : message.content;

    modelMessages.push({ role: message.role, content });
  }

  return modelMessages;
}

export async function narratePlayerAction(input: NarrateInput) {
  const result = await generateText({
    model,
    maxRetries: 0,
    system: buildCampaignSystemPrompt(input.campaign, input.recentEvents),
    messages: toModelMessages(input.recentMessages),
    tools: createTools({
      campaignId: input.campaign.id,
      authorId: input.authorId,
      ruleset: input.campaign.state.ruleset,
    }),
    stopWhen: stepCountIs(8),
  });

  return parseVoiceSegments(result.text.trim() || "A cena fica em suspenso. O que vocês fazem?");
}

export async function guideCampaignSetup(input: NarrateInput & { authorName: string }) {
  const result = await generateText({
    model,
    maxRetries: 0,
    system: buildSetupSystemPrompt(input.campaign, {
      id: input.authorId,
      name: input.authorName,
    }),
    messages: toModelMessages(input.recentMessages),
    tools: createSetupTools({
      campaignId: input.campaign.id,
      playerId: input.authorId,
      playerName: input.authorName,
      ruleset: input.campaign.state.ruleset,
    }),
    stopWhen: stepCountIs(6),
  });

  return parseVoiceSegments(result.text.trim()
    || "Conte o nome e o conceito do seu personagem, ou diga que tipo de herói gostaria de interpretar.");
}

export async function openCampaign(campaign: Campaign) {
  const result = await generateText({
    model,
    maxRetries: 0,
    system: `${buildCampaignSystemPrompt(campaign)}

Abra a campanha agora:
- Apresente em poucas linhas a premissa construída na sessão zero.
- Introduza todos os personagens dos jogadores sem controlar suas decisões.
- Narre uma primeira cena concreta, com atmosfera, local e um problema imediato.
- Termine perguntando claramente o que os personagens fazem.
- Não peça mais informações de preparação e não mencione /rpg comecar.`,
    messages: [{
      role: "user",
      content: "A sessão zero terminou. Comece a aventura com base no estado confirmado da campanha.",
    }],
  });

  return parseVoiceSegments(result.text.trim() || "A aventura começa. Diante de vocês, algo rompe a calmaria. O que fazem?");
}

export async function summarizeCampaign(campaign: Campaign, recentMessages: CampaignMessage[]) {
  const narrativeState = {
    ...campaign.state,
    relationships: campaign.state.relationships.map(getNarrativeRelationshipView),
  };
  const result = await generateText({
    model,
    maxRetries: 0,
    system: `${promptBase}\n\nGere um resumo objetivo da sessão/campanha até aqui. Não narre cena nova.`,
    messages: [
      {
        role: "user",
        content: `Campanha: ${campaign.title}\nEstado atual:\n${JSON.stringify(narrativeState, null, 2)}\n\nMensagens recentes:\n${recentMessages
          .map((message) => `${message.role.toUpperCase()}${message.author_name ? ` (${message.author_name})` : ""}: ${message.content}`)
          .join("\n")}`,
      },
    ],
  });

  const summary = result.text.trim();
  if (summary) {
    await updateCampaignNarrative({
      campaignId: campaign.id,
      summary,
      reason: "Resumo solicitado pelos jogadores.",
    });
  }

  return summary || campaign.state.summary || "Ainda não há resumo suficiente para esta campanha.";
}

export async function summarizeSpeechQueue(contents: string[]) {
  const result = await generateText({
    model,
    maxRetries: 0,
    maxOutputTokens: 300,
    system:
      "Resuma em português do Brasil os trechos narrativos pendentes em uma fala contínua, clara e curta. Preserve acontecimentos, decisões e perguntas dirigidas aos jogadores. Não mencione que é um resumo.",
    prompt: contents.join("\n\n"),
  });

  return result.text.trim();
}
