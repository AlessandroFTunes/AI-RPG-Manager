import { SlashCommandBuilder } from "discord.js";

export const rpgCommand = new SlashCommandBuilder()
  .setName("rpg")
  .setDescription("Gerencia campanhas de RPG narradas por IA")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("iniciar")
      .setDescription("Cria uma thread e inicia uma campanha de RPG")
      .addStringOption((option) =>
        option.setName("titulo").setDescription("Título da campanha").setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("sistema")
          .setDescription("Sistema, gênero ou tom da campanha")
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("estado").setDescription("Mostra o estado resumido da campanha atual"),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("resumo").setDescription("Gera e salva um resumo da campanha atual"),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("rolar")
      .setDescription("Rola dados na campanha atual")
      .addStringOption((option) =>
        option.setName("expressao").setDescription('Ex: "1d20+3", "2d6", "4d6kh3"').setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("encerrar").setDescription("Encerra a campanha desta thread"),
  );

export const commands = [rpgCommand.toJSON()];
