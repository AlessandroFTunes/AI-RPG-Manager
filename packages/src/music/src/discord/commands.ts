import { SlashCommandBuilder } from "discord.js";

export const musicCommand = new SlashCommandBuilder()
  .setName("music")
  .setDescription("Controla o bot de ambiente instrumental")
  .addSubcommand((subcommand) =>
    subcommand.setName("status").setDescription("Mostra o ambiente atual e o tamanho da fila"),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("skip").setDescription("Pula o ambiente atual"),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("stop").setDescription("Para o ambiente atual e limpa a fila"),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("leave").setDescription("Faz o bot sair do canal de voz"),
  );

export const commands = [musicCommand.toJSON()];
