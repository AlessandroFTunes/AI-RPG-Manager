import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  Events,
  ThreadAutoArchiveDuration,
  type Message,
} from "discord.js";
import {
  closeCampaign,
  createCampaign,
  getActiveCampaignByThread,
  getRecentCampaignMessages,
  patchCampaignState,
  saveCampaignMessage,
  saveDiceRoll,
} from "../db/campaignRepository";
import { buildCampaignContext } from "../model/campaignContext";
import { narratePlayerAction, summarizeCampaign } from "../model/narrator";
import { rollDiceExpression } from "../tools";
import { sendLongMessage } from "./sendLongMessage";

export function registerDiscordEvents(client: Client) {
  client.once(Events.ClientReady, (readyClient) => {
    console.log(`RPG bot online as ${readyClient.user.tag}.`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "rpg") return;

    try {
      await handleRpgCommand(interaction);
    } catch (error) {
      console.error("[rpg command]", error);
      const message = error instanceof Error ? error.message : "Erro inesperado ao executar comando.";

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(`Erro: ${message}`);
      } else {
        await interaction.reply({ content: `Erro: ${message}`, ephemeral: true });
      }
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await handleCampaignMessage(message);
    } catch (error) {
      console.error("[rpg message]", error);
      if (message.channel.isSendable()) {
        await message.channel.send("Não consegui processar essa ação agora. Tente novamente em instantes.");
      }
    }
  });
}

async function handleRpgCommand(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "iniciar":
      await startCampaign(interaction);
      return;
    case "estado":
      await showCampaignState(interaction);
      return;
    case "resumo":
      await summarizeCurrentCampaign(interaction);
      return;
    case "rolar":
      await rollInCampaign(interaction);
      return;
    case "encerrar":
      await closeCurrentCampaign(interaction);
      return;
  }
}

async function startCampaign(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Use este comando dentro de um servidor.", ephemeral: true });
    return;
  }

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "Use /rpg iniciar em um canal de texto do servidor.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const title = interaction.options.getString("titulo", true).trim();
  const system = interaction.options.getString("sistema")?.trim() || "fantasia narrativa";
  const thread = await channel.threads.create({
    name: `RPG - ${title}`.slice(0, 100),
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    reason: `Campanha de RPG iniciada por ${interaction.user.tag}`,
  });

  const campaign = await createCampaign({
    guildId: interaction.guildId,
    channelId: channel.id,
    threadId: thread.id,
    ownerId: interaction.user.id,
    title,
    system,
  });

  const intro = `Campanha **${campaign.title}** iniciada.\nSistema/tema: **${campaign.system}**.\n\nEscrevam suas ações nesta thread. Eu narro as consequências e peço rolagens quando necessário.`;
  await thread.send(intro);
  await saveCampaignMessage({
    campaignId: campaign.id,
    role: "assistant",
    content: intro,
    metadata: { type: "campaign_started" },
  });

  await interaction.editReply(`Campanha criada: ${thread.toString()}`);
}

function getThreadId(interaction: ChatInputCommandInteraction) {
  const channel = interaction.channel;
  return channel?.isThread() ? channel.id : null;
}

async function requireActiveCampaign(interaction: ChatInputCommandInteraction) {
  const threadId = getThreadId(interaction);
  if (!threadId) {
    await interaction.reply({ content: "Use este comando dentro de uma thread de campanha.", ephemeral: true });
    return null;
  }

  const campaign = await getActiveCampaignByThread(threadId);
  if (!campaign) {
    await interaction.reply({ content: "Não encontrei uma campanha ativa nesta thread.", ephemeral: true });
    return null;
  }

  return campaign;
}

async function showCampaignState(interaction: ChatInputCommandInteraction) {
  const campaign = await requireActiveCampaign(interaction);
  if (!campaign) return;

  const state = campaign.state;
  await interaction.reply({
    content: [
      `**${campaign.title}**`,
      `Sistema/tema: ${campaign.system}`,
      `Cena atual: ${state.currentScene || "não definida"}`,
      `Resumo: ${state.summary || "sem resumo ainda"}`,
    ].join("\n"),
    ephemeral: true,
  });
}

async function summarizeCurrentCampaign(interaction: ChatInputCommandInteraction) {
  const campaign = await requireActiveCampaign(interaction);
  if (!campaign) return;

  await interaction.deferReply();
  const recentMessages = await getRecentCampaignMessages(campaign.id, 40);
  const summary = await summarizeCampaign(campaign, recentMessages);

  await saveCampaignMessage({
    campaignId: campaign.id,
    authorId: interaction.user.id,
    authorName: interaction.user.displayName,
    role: "assistant",
    content: summary,
    metadata: { type: "summary" },
  });

  await interaction.editReply(`**Resumo atualizado**\n${summary}`);
}

async function rollInCampaign(interaction: ChatInputCommandInteraction) {
  const campaign = await requireActiveCampaign(interaction);
  if (!campaign) return;

  const expression = interaction.options.getString("expressao", true);
  const result = rollDiceExpression(expression);
  await saveDiceRoll({
    campaignId: campaign.id,
    authorId: interaction.user.id,
    expression,
    result,
  });

  await saveCampaignMessage({
    campaignId: campaign.id,
    authorId: interaction.user.id,
    authorName: interaction.user.displayName,
    role: "tool",
    content: result.detail,
    metadata: { type: "dice_roll", result },
  });

  await interaction.reply(`🎲 ${interaction.user.displayName} rolou **${result.detail}**`);
}

async function closeCurrentCampaign(interaction: ChatInputCommandInteraction) {
  const campaign = await requireActiveCampaign(interaction);
  if (!campaign) return;

  await closeCampaign(campaign.id);
  await interaction.reply(`Campanha **${campaign.title}** encerrada.`);
}

async function handleCampaignMessage(message: Message) {
  if (message.author.bot || !message.guildId || !message.channel.isThread()) return;

  const content = message.content.trim();
  if (!content) return;

  const campaign = await getActiveCampaignByThread(message.channel.id);
  if (!campaign) return;

  await message.channel.sendTyping();
  const savedMessage = await saveCampaignMessage({
    campaignId: campaign.id,
    discordMessageId: message.id,
    authorId: message.author.id,
    authorName: message.member?.displayName ?? message.author.displayName,
    role: "user",
    content,
  });
  if (!savedMessage?.inserted) return;

  const context = await buildCampaignContext(campaign.id);
  const response = await narratePlayerAction({
    ...context,
    authorId: message.author.id,
  });

  await saveCampaignMessage({
    campaignId: campaign.id,
    authorId: message.client.user.id,
    authorName: message.client.user.displayName,
    role: "assistant",
    content: response,
  });

  if (response.toLowerCase().startsWith("resumo:")) {
    await patchCampaignState(campaign.id, { summary: response.replace(/^resumo:\s*/i, "") });
  }

  await sendLongMessage(message.channel, response);
}
