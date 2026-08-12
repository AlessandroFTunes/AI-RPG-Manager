import { closeDatabase } from "./config/database";
import { createDiscordClient } from "./config/discord";
import { env } from "./config/env";
import { registerDiscordEvents } from "./discord/events";

const client = createDiscordClient();

registerDiscordEvents(client);

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(env.DISCORD_TOKEN);

async function shutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down RPG bot...`);
  client.destroy();
  await closeDatabase();
  process.exit(0);
}
