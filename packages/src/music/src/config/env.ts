import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceEnvPath = resolve(currentDir, "../../../../..", ".env");
const packageEnvPath = resolve(currentDir, "../../", ".env");

loadEnv({ path: workspaceEnvPath });
loadEnv({ path: packageEnvPath, override: false });

const envSchema = z.object({
  MUSIC_DISCORD_TOKEN: z.string().min(1, "MUSIC_DISCORD_TOKEN is required"),
  MUSIC_DISCORD_CLIENT_ID: z.string().min(1, "MUSIC_DISCORD_CLIENT_ID is required"),
  MUSIC_DISCORD_GUILD_ID: z.string().min(1, "MUSIC_DISCORD_GUILD_ID is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  MUSIC_OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  MUSIC_OPENROUTER_MODEL: z.string().default("openrouter/free"),
  MUSIC_REQUEST_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  YTDLP_BIN: z.string().default("yt-dlp"),
  FFMPEG_BIN: z.string().default("ffmpeg"),
}).superRefine((value, ctx) => {
  if (!value.MUSIC_OPENROUTER_API_KEY && !value.OPENROUTER_API_KEY) {
    ctx.addIssue({
      code: "custom",
      path: ["MUSIC_OPENROUTER_API_KEY"],
      message: "MUSIC_OPENROUTER_API_KEY or OPENROUTER_API_KEY is required",
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment:\n${details.join("\n")}`);
}

export const env = parsed.data;
