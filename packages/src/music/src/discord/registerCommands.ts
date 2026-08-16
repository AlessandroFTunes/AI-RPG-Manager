import { REST, Routes } from "discord.js";
import { env } from "../config/env";
import { commands } from "./commands";

const rest = new REST({ version: "10" }).setToken(env.MUSIC_DISCORD_TOKEN);

await rest.put(Routes.applicationGuildCommands(env.MUSIC_DISCORD_CLIENT_ID, env.MUSIC_DISCORD_GUILD_ID), {
  body: commands,
});

console.log(`Registered ${commands.length} music command(s) for guild ${env.MUSIC_DISCORD_GUILD_ID}.`);
