import { closeDatabase } from "./config/database";
import { createDiscordClient } from "./config/discord";
import { env } from "./config/env";
import { registerDiscordEvents } from "./discord/events";
import { ambientPlayer } from "./music/player";
import { stopMusicRequestWorker } from "./music/requestWorker";
import { createLogger } from "../../shared/logging/logger";

const logger = createLogger("music");

const client = createDiscordClient();

registerDiscordEvents(client);

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await client.login(env.MUSIC_DISCORD_TOKEN);

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("service_shutdown", { signal });
  stopMusicRequestWorker();
  ambientPlayer.destroyAll();
  client.destroy();
  await closeDatabase();
  process.exit(0);
}
