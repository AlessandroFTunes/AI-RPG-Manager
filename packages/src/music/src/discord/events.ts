import { ChannelType, Events, type ChatInputCommandInteraction, type Client } from "discord.js";
import { createLogger, runWithLogContext } from "../../../shared/logging/logger";
import { ambientPlayer } from "../music/player";
import { startMusicRequestWorker } from "../music/requestWorker";

const logger = createLogger("music");

export function registerDiscordEvents(client: Client) {
  client.once(Events.ClientReady, (readyClient) => {
    logger.info("service_ready", { discord_user: readyClient.user.tag });
    startMusicRequestWorker(readyClient);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "music") return;
    await runWithLogContext({ interaction_id: interaction.id }, () => handleMusicCommand(interaction));
  });

  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const channel = newState.channel ?? oldState.channel;
    if (!channel || channel.type !== ChannelType.GuildVoice) return;
    ambientPlayer.scheduleDisconnectIfEmpty(channel.guild.id, channel);
  });
}

async function handleMusicCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Use este comando dentro de um servidor.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  switch (subcommand) {
    case "status": {
      const status = ambientPlayer.getStatus(interaction.guildId);
      await interaction.reply({
        content: status
          ? `Canal: <#${status.channelId}>\nAtual: ${status.current?.title ?? "nada tocando"}\nFila: ${status.queueLength}`
          : "Nenhum ambiente ativo agora.",
        ephemeral: true,
      });
      return;
    }
    case "skip": {
      const skipped = ambientPlayer.skip(interaction.guildId);
      await interaction.reply({ content: skipped ? "Ambiente pulado." : "Nada para pular agora.", ephemeral: true });
      return;
    }
    case "stop": {
      const stopped = ambientPlayer.stop(interaction.guildId);
      await interaction.reply({ content: stopped ? "Ambiente parado e fila limpa." : "Nada tocando agora.", ephemeral: true });
      return;
    }
    case "leave": {
      const left = ambientPlayer.leave(interaction.guildId);
      await interaction.reply({ content: left ? "Saí do canal de voz." : "Eu já não estava em voz.", ephemeral: true });
      return;
    }
  }
}
