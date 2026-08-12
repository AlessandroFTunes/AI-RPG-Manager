import { REST, Routes } from "discord.js";
import { env } from "../config/env";
import { commands } from "./commands";

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);

await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
  body: commands,
});

console.log(`Registered ${commands.length} RPG command(s) for guild ${env.DISCORD_GUILD_ID}.`);
