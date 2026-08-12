import { generateText, stepCountIs, type ModelMessage } from "ai";
import type { Campaign, CampaignEvent, CampaignMessage } from "../db/campaignRepository";
import { patchCampaignState } from "../db/campaignRepository";
import { createTools } from "../tools";
import { buildCampaignSystemPrompt, promptBase } from "./promptBase";
import { model } from "./provider";

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
    system: buildCampaignSystemPrompt(input.campaign, input.recentEvents),
    messages: toModelMessages(input.recentMessages),
    tools: createTools({ campaignId: input.campaign.id, authorId: input.authorId }),
    stopWhen: stepCountIs(8),
  });

  return result.text.trim() || "A cena fica em suspenso. O que vocês fazem?";
}

export async function summarizeCampaign(campaign: Campaign, recentMessages: CampaignMessage[]) {
  const result = await generateText({
    model,
    system: `${promptBase}\n\nGere um resumo objetivo da sessão/campanha até aqui. Não narre cena nova.`,
    messages: [
      {
        role: "user",
        content: `Campanha: ${campaign.title}\nEstado atual:\n${JSON.stringify(campaign.state, null, 2)}\n\nMensagens recentes:\n${recentMessages
          .map((message) => `${message.role.toUpperCase()}${message.author_name ? ` (${message.author_name})` : ""}: ${message.content}`)
          .join("\n")}`,
      },
    ],
  });

  const summary = result.text.trim();
  if (summary) {
    await patchCampaignState(campaign.id, { summary });
  }

  return summary || campaign.state.summary || "Ainda não há resumo suficiente para esta campanha.";
}
