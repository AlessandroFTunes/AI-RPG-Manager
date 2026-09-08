import { REST, Routes } from "discord.js";
import { createLogger } from "../../../shared/logging/logger";
import { env } from "../config/env";
import { commands } from "./commands";

const logger = createLogger("rpg");

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
  body: commands,
});

logger.info("discord_commands_registered", {
  command_count: commands.length,
  guild_id: env.DISCORD_GUILD_ID,
});
