import { closeDatabase } from "./config/database";
import { createDiscordClient } from "./config/discord";
import { env } from "./config/env";
import { registerDiscordEvents } from "./discord/events";
import { voiceManager } from "./voice/voiceManager";

const client = createDiscordClient();

registerDiscordEvents(client);

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(env.DISCORD_TOKEN);

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}. Shutting down RPG bot...`);
  voiceManager.destroyAll();
  client.destroy();
  await closeDatabase();
  process.exit(0);
}
