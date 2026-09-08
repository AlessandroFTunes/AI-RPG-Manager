import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  Events,
  ThreadAutoArchiveDuration,
  type Message,
} from "discord.js";
import type { CampaignRuleset } from "../db/campaignRepository";
import {
  closeCampaign,
  createCampaign,
  getActiveCampaignByThread,
  getActiveVoiceCampaignByGuild,
  getActiveVoiceCampaigns,
  getCampaignById,
  getRecentCampaignMessages,
  updateCampaignNarrative,
  registerNpcVoiceAppearances,
  saveCampaignEvent,
  saveCampaignMessage,
  saveDiceRoll,
} from "../db/campaignRepository";
import { buildCampaignContext } from "../model/campaignContext";
import {
  guideCampaignSetup,
  narratePlayerAction,
  openCampaign,
  summarizeCampaign,
  summarizeSpeechQueue,
} from "../model/narrator";
import { isAIProvidersUnavailableError } from "../model/resilientModel";
import { rollDiceExpression } from "../tools";
import { sendLongMessage } from "./sendLongMessage";
import { env } from "../config/env";
import { voiceManager } from "../voice/voiceManager";
import { normalizeNpcId, type NarratedResponse, type VoiceSegment } from "../voice/segments";
import { queueAmbientMusicRequest } from "../music/ambientRequest";
import { formatWorldClock } from "../world/worldClock";
import {
  campaignLockKey,
  guildCreationLockKey,
  runPersistentInteraction,
} from "../interactions/orchestrator";
import { createLogger } from "../../../shared/logging/logger";

const campaignQueues = new Map<string, Promise<void>>();
const logger = createLogger("rpg");

function enqueueCampaignTask(campaignId: string, task: () => Promise<void>) {
  const previousTask = campaignQueues.get(campaignId) ?? Promise.resolve();
  const currentTask = previousTask.then(task, task);
  campaignQueues.set(campaignId, currentTask);

  return currentTask.finally(() => {
    if (campaignQueues.get(campaignId) === currentTask) {
      campaignQueues.delete(campaignId);
    }
  });
}

function getPublicErrorMessage(error: unknown) {
  return isAIProvidersUnavailableError(error)
    ? "Os provedores de IA estão ocupados agora. Sua mensagem foi salva; tente continuar em alguns instantes."
    : "Não consegui processar essa ação agora. Tente novamente em instantes.";
}

export function registerDiscordEvents(client: Client) {
  voiceManager.setSummarizer(summarizeSpeechQueue);

  client.once(Events.ClientReady, async (readyClient) => {
    logger.info("discord.ready", { bot_tag: readyClient.user.tag });
    await reconnectVoiceCampaigns(readyClient);
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const channel = newState.channel ?? oldState.channel;
    if (!channel || newState.member?.user.bot) return;

    const campaign = await getActiveVoiceCampaignByGuild(newState.guild.id);
    if (!campaign?.state.voice.channelId) return;
    if (newState.channelId === campaign.state.voice.channelId && !voiceManager.getSession(newState.guild.id)) {
      const configuredChannel = newState.guild.channels.cache.get(campaign.state.voice.channelId);
      if (configuredChannel?.isVoiceBased()) {
        try {
          await voiceManager.connect(newState.guild, configuredChannel, campaign.state.voice.provider);
        } catch (error) {
          logger.error("voice.reconnect_failed", error, { campaign_id: campaign.id });
        }
      }
    }
    const configuredChannel = newState.guild.channels.cache.get(campaign.state.voice.channelId);
    if (configuredChannel?.isVoiceBased()) {
      voiceManager.scheduleDisconnectIfEmpty(newState.guild.id, configuredChannel);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "rpg") return;

    try {
      await handleRpgCommand(interaction);
    } catch (error) {
      if (isAIProvidersUnavailableError(error)) {
        logger.warn("discord.command_ai_unavailable");
      } else {
        logger.error("discord.command_failed", error, { interaction_id: interaction.id });
      }
      const message = getPublicErrorMessage(error);

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
      if (isAIProvidersUnavailableError(error)) {
        logger.warn("discord.message_ai_unavailable", { interaction_id: message.id });
      } else {
        logger.error("discord.message_failed", error, { interaction_id: message.id });
      }
      if (message.channel.isSendable()) {
        await message.channel.send(getPublicErrorMessage(error));
      }
    }
  });
}

async function reconnectVoiceCampaigns(client: Client<true>) {
  const campaigns = await getActiveVoiceCampaigns();
  const connectedGuilds = new Set<string>();
  for (const campaign of campaigns) {
    if (!campaign.state.voice.channelId || connectedGuilds.has(campaign.guild_id)) continue;
    const guild = client.guilds.cache.get(campaign.guild_id);
    const channel = guild?.channels.cache.get(campaign.state.voice.channelId);
    if (!guild || !channel?.isVoiceBased()) continue;
    if (!channel.members.some((member) => !member.user.bot)) continue;

    try {
      await voiceManager.connect(guild, channel, campaign.state.voice.provider);
      connectedGuilds.add(guild.id);
    } catch (error) {
      logger.error("voice.startup_failed", error, { campaign_id: campaign.id });
    }
  }
}

async function assignNpcVoices(
  campaignId: string,
  playerCharacters: Array<{ id: string; name: string }>,
  response: NarratedResponse,
) {
  const playerIds = new Set(playerCharacters.flatMap((character) => [
    character.id,
    character.name.toLowerCase(),
    normalizeNpcId(character.name),
  ]));
  const npcs = response.voiceSegments
    .filter((segment): segment is VoiceSegment & { npcId: string; name: string } => {
      if (segment.speaker !== "npc" || !segment.npcId || !segment.name) return false;
      return !playerIds.has(segment.npcId) && !playerIds.has(segment.name.toLowerCase());
    })
    .map((segment) => ({ npcId: segment.npcId, name: segment.name }));
  const voiceCast = await registerNpcVoiceAppearances(campaignId, npcs);

  return response.voiceSegments.map((segment) => segment.speaker === "npc" && segment.npcId
    ? playerIds.has(segment.npcId) || (segment.name && playerIds.has(segment.name.toLowerCase()))
      ? { ...segment, speak: false }
      : { ...segment, profile: voiceCast[segment.npcId]?.profile ?? "narrator" }
    : { ...segment, profile: "narrator" as const });
}

async function handleRpgCommand(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "iniciar":
      await startCampaign(interaction);
      return;
    case "comecar":
      await beginCampaign(interaction);
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
  const guildId = interaction.guildId;

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "Use /rpg iniciar em um canal de texto do servidor.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const execution = await runPersistentInteraction({
    externalId: `discord:interaction:${interaction.id}`,
    actorId: interaction.user.id,
    kind: "campaign_create",
    lockKey: guildCreationLockKey(guildId),
  }, async () => {

  const member = await interaction.guild!.members.fetch(interaction.user.id);
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) {
    await interaction.editReply("Entre em um canal de voz antes de criar a campanha.");
    return;
  }
  if (voiceChannel.type !== ChannelType.GuildVoice) {
    await interaction.editReply("Use um canal de voz comum; canais de palco ainda não são suportados.");
    return;
  }
  if (!voiceChannel.joinable || !voiceChannel.speakable) {
    await interaction.editReply("Não tenho permissão para entrar e falar no seu canal de voz.");
    return;
  }
  const existingVoiceCampaign = await getActiveVoiceCampaignByGuild(guildId);
  if (existingVoiceCampaign) {
    await interaction.editReply(`Já existe uma campanha ativa usando voz neste servidor: **${existingVoiceCampaign.title}**.`);
    return;
  }

  await voiceManager.connect(interaction.guild!, voiceChannel, env.TTS_PROVIDER);
  try {
    const title = interaction.options.getString("titulo", true).trim();
    const system = interaction.options.getString("sistema")?.trim() || "fantasia narrativa";
    const ruleset = (interaction.options.getString("regras") ?? "narrative") as CampaignRuleset;
    const thread = await channel.threads.create({
      name: `RPG - ${title}`.slice(0, 100),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      reason: `Campanha de RPG iniciada por ${interaction.user.tag}`,
    });

    const campaign = await createCampaign({
      guildId,
      channelId: channel.id,
      threadId: thread.id,
      ownerId: interaction.user.id,
      title,
      system,
      ruleset,
      voice: { enabled: true, channelId: voiceChannel.id, provider: env.TTS_PROVIDER },
    });

    const intro = [
      `**Sessão zero de ${campaign.title}**`,
      `Sistema/tema inicial: **${campaign.system}**.`,
      `Regras: **${formatRuleset(campaign.state.ruleset)}**.`,
      "",
      "Antes da aventura, vamos construir juntos a premissa e os personagens.",
      `Para começar: **${interaction.user.displayName}**, que tipo de história você gostaria de viver? Pode citar temas, clima ou obras de referência.`,
      "",
      "Cada jogador pode entrar na conversa e criar seu próprio personagem. Quando todos estiverem prontos, o dono usa `/rpg comecar`.",
    ].join("\n");
    await thread.send(intro);
    await saveCampaignMessage({
      campaignId: campaign.id,
      role: "assistant",
      content: intro,
      metadata: { type: "campaign_started" },
    });

    await interaction.editReply(`Campanha criada: ${thread.toString()}`);
    await voiceManager.enqueue(guildId, intro);
  } catch (error) {
    voiceManager.disconnect(guildId);
    throw error;
  }
  });
  if (execution.duplicate) {
    await interaction.editReply("Este comando já foi processado anteriormente.");
  }
}

function formatRuleset(ruleset: CampaignRuleset) {
  switch (ruleset) {
    case "dnd5e-2014":
      return "D&D 5e 2014 (SRD 5.1)";
    case "dnd5e-2024":
      return "D&D 5e 2024 (SRD 5.2)";
    default:
      return "narrativo";
  }
}

async function beginCampaign(interaction: ChatInputCommandInteraction) {
  const campaign = await requireActiveCampaign(interaction);
  if (!campaign) return;

  if (interaction.user.id !== campaign.owner_id) {
    await interaction.reply({ content: "Somente o dono da campanha pode começar a aventura.", ephemeral: true });
    return;
  }

  if (campaign.state.phase !== "setup") {
    await interaction.reply({ content: "A aventura já começou.", ephemeral: true });
    return;
  }

  if (campaign.state.characters.length === 0) {
    await interaction.reply({
      content: "Registrem pelo menos um personagem conversando comigo antes de começar.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();
  const execution = await runPersistentInteraction({
    externalId: `discord:interaction:${interaction.id}`,
    campaignId: campaign.id,
    actorId: interaction.user.id,
    kind: "campaign_begin",
    lockKey: campaignLockKey(campaign.id),
  }, async () => {
  const lockedCampaign = await getCampaignById(campaign.id);
  if (!lockedCampaign || lockedCampaign.status !== "active") throw new Error("Campaign not found");
  if (lockedCampaign.state.phase !== "setup") {
    await interaction.editReply("A aventura já começou.");
    return;
  }
  const opening = await openCampaign(lockedCampaign);
  const voiceSegments = await assignNpcVoices(lockedCampaign.id, lockedCampaign.state.characters, opening);
  const currentScene = opening.content.split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 500);
  const updatedCampaign = await updateCampaignNarrative({
    campaignId: lockedCampaign.id,
    actorId: interaction.user.id,
    phase: "playing",
    currentScene,
    summary: `A campanha começou com ${lockedCampaign.state.characters.map((character) => character.name).join(", ")}.`,
    reason: "A sessão zero terminou e a campanha começou.",
  });
  if (!updatedCampaign) throw new Error("Campaign not found");

  await saveCampaignEvent({
    campaignId: lockedCampaign.id,
    type: "campaign_started",
    actorId: interaction.user.id,
    data: {
      premise: lockedCampaign.state.setup.premise,
      characters: lockedCampaign.state.characters.map((character) => character.name),
    },
    importance: 5,
  });
  await saveCampaignMessage({
    campaignId: lockedCampaign.id,
    authorId: interaction.client.user.id,
    authorName: interaction.client.user.displayName,
    role: "assistant",
    content: opening.content,
    metadata: { type: "campaign_opening", voiceSegments },
  });

  await interaction.editReply("A sessão zero terminou. A aventura começa agora.");
  if (!interaction.channel?.isSendable()) throw new Error("Campaign channel is not sendable");
  await sendLongMessage(interaction.channel, opening.content);
  await voiceManager.enqueue(lockedCampaign.guild_id, voiceSegments);
  await queueAmbientMusicRequest(updatedCampaign, {
    requestedBy: interaction.user.id,
    source: "auto",
    reason: "A aventura começou com uma nova cena de abertura.",
    sceneType: "opening",
    mood: updatedCampaign.state.setup.tone || undefined,
    indication: updatedCampaign.state.setup.tone || undefined,
    replaceCurrent: true,
    force: true,
  });
  });
  if (execution.duplicate) {
    await interaction.editReply("Este comando já foi processado anteriormente.");
  }
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
      `Regras: ${formatRuleset(state.ruleset)}`,
      `Fase: ${state.phase === "setup" ? "sessão zero" : "aventura"}`,
      `Data e hora: ${formatWorldClock(state.worldClock)}`,
      `Cena atual: ${state.currentScene || "não definida"}`,
      `Resumo: ${state.summary || "sem resumo ainda"}`,
      `Personagens: ${state.characters.length > 0
        ? state.characters.map((character) => `${character.name} (${character.playerName ?? "jogador não informado"})`).join(", ")
        : "nenhum registrado"}`,
    ].join("\n"),
    ephemeral: true,
  });
}

async function summarizeCurrentCampaign(interaction: ChatInputCommandInteraction) {
  const campaign = await requireActiveCampaign(interaction);
  if (!campaign) return;

  await interaction.deferReply();
  const execution = await runPersistentInteraction({
    externalId: `discord:interaction:${interaction.id}`,
    campaignId: campaign.id,
    actorId: interaction.user.id,
    kind: "campaign_summary",
    lockKey: campaignLockKey(campaign.id),
  }, async () => {
  const lockedCampaign = await getCampaignById(campaign.id);
  if (!lockedCampaign) throw new Error("Campaign not found");
  const recentMessages = await getRecentCampaignMessages(lockedCampaign.id, 40);
  const summary = await summarizeCampaign(lockedCampaign, recentMessages);

  await saveCampaignMessage({
    campaignId: lockedCampaign.id,
    authorId: interaction.user.id,
    authorName: interaction.user.displayName,
    role: "assistant",
    content: summary,
    metadata: { type: "summary" },
  });

  await interaction.editReply(`**Resumo atualizado**\n${summary}`);
  await voiceManager.enqueue(lockedCampaign.guild_id, summary);
  });
  if (execution.duplicate) {
    await interaction.editReply("Este comando já foi processado anteriormente.");
  }
}

async function rollInCampaign(interaction: ChatInputCommandInteraction) {
  const campaign = await requireActiveCampaign(interaction);
  if (!campaign) return;

  await interaction.deferReply();
  const execution = await runPersistentInteraction({
    externalId: `discord:interaction:${interaction.id}`,
    campaignId: campaign.id,
    actorId: interaction.user.id,
    kind: "campaign_roll",
    lockKey: campaignLockKey(campaign.id),
  }, async () => {
  const expression = interaction.options.getString("expressao", true);
  const result = rollDiceExpression(expression);
  const savedRoll = await saveDiceRoll({
    campaignId: campaign.id,
    authorId: interaction.user.id,
    expression,
    result,
  });
  const persistedResult = savedRoll.result as typeof result;

  await saveCampaignMessage({
    campaignId: campaign.id,
    authorId: interaction.user.id,
    authorName: interaction.user.displayName,
    role: "tool",
    content: persistedResult.detail,
    metadata: { type: "dice_roll", result: persistedResult },
  });

  await interaction.editReply(`🎲 ${interaction.user.displayName} rolou **${persistedResult.detail}**`);
  });
  if (execution.duplicate) {
    await interaction.editReply("Este comando já foi processado anteriormente.");
  }
}

async function closeCurrentCampaign(interaction: ChatInputCommandInteraction) {
  const campaign = await requireActiveCampaign(interaction);
  if (!campaign) return;

  await interaction.deferReply();
  const execution = await runPersistentInteraction({
    externalId: `discord:interaction:${interaction.id}`,
    campaignId: campaign.id,
    actorId: interaction.user.id,
    kind: "campaign_close",
    lockKey: campaignLockKey(campaign.id),
  }, async () => {
  await closeCampaign(campaign.id);
  if (campaign.state.voice.enabled) voiceManager.disconnect(campaign.guild_id);
  await interaction.editReply(`Campanha **${campaign.title}** encerrada.`);
  });
  if (execution.duplicate) {
    await interaction.editReply("Este comando já foi processado anteriormente.");
  }
}

async function handleCampaignMessage(message: Message) {
  if (message.author.bot || !message.guildId || !message.channel.isThread()) return;

  const channel = message.channel;
  const content = message.content.trim();
  if (!content) return;

  const campaign = await getActiveCampaignByThread(channel.id);
  if (!campaign) return;

  await enqueueCampaignTask(campaign.id, async () => {
    await runPersistentInteraction({
      externalId: `discord:message:${message.id}`,
      campaignId: campaign.id,
      actorId: message.author.id,
      kind: "campaign_message",
      lockKey: campaignLockKey(campaign.id),
    }, async () => {
      await channel.sendTyping();
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
      const authorName = message.member?.displayName ?? message.author.displayName;
      const response = context.campaign.state.phase === "setup"
        ? await guideCampaignSetup({
            ...context,
            authorId: message.author.id,
            authorName,
          })
        : await narratePlayerAction({
            ...context,
            authorId: message.author.id,
          });
      const voiceSegments = await assignNpcVoices(campaign.id, context.campaign.state.characters, response);

      await saveCampaignMessage({
        campaignId: campaign.id,
        authorId: message.client.user.id,
        authorName: message.client.user.displayName,
        role: "assistant",
        content: response.content,
        metadata: {
          type: context.campaign.state.phase === "setup" ? "session_zero" : "narration",
          voiceSegments,
        },
      });

      if (context.campaign.state.phase === "playing" && response.content.toLowerCase().startsWith("resumo:")) {
        await updateCampaignNarrative({
          campaignId: campaign.id,
          actorId: message.author.id,
          summary: response.content.replace(/^resumo:\s*/i, ""),
          reason: "A cena avançou após uma ação do jogador.",
        });
      }

      await sendLongMessage(channel, response.content);
      await voiceManager.enqueue(campaign.guild_id, voiceSegments);
    });
  });
}
