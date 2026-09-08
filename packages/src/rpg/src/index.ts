import { closeDatabase } from "./config/database";
import { createDiscordClient } from "./config/discord";
import { env } from "./config/env";
import { registerDiscordEvents } from "./discord/events";
import { voiceManager } from "./voice/voiceManager";
import { createLogger } from "../../shared/logging/logger";

const logger = createLogger("rpg");

const client = createDiscordClient();

registerDiscordEvents(client);

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(env.DISCORD_TOKEN);

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("service_shutdown", { signal });
  voiceManager.destroyAll();
  client.destroy();
  await closeDatabase();
  process.exit(0);
}
