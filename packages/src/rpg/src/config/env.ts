import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceEnvPath = resolve(currentDir, "../../../../..", ".env");
const packageEnvPath = resolve(currentDir, "../../", ".env");

loadEnv({ path: workspaceEnvPath });
loadEnv({ path: packageEnvPath, override: false });

const envSchema = z
  .object({
    DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
    DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
    DISCORD_GUILD_ID: z.string().min(1, "DISCORD_GUILD_ID is required"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    AI_PROVIDER: z.enum(["nvidia", "openai"]).default("nvidia"),
    NVIDIA_API_KEY: z.string().optional(),
    NVIDIA_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
    NVIDIA_MODEL: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_MODEL: z.string().default("openrouter/free"),

    TTS_PROVIDER: z.enum(["piper", "elevenlabs", "openai"]).default("piper"),
    PIPER_HOST: z.string().default("100.70.59.77"),
    PIPER_PORT: z.coerce.number().int().positive().default(10200),
    PIPER_VOICE: z.string().default("pt_BR-cadu-medium"),
    ELEVENLABS_API_KEY: z.string().optional(),
    ELEVENLABS_VOICE_ID: z.string().optional(),
    OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
    OPENAI_TTS_VOICE: z.string().default("onyx"),
  })
  .superRefine((value, ctx) => {
    if (value.AI_PROVIDER === "nvidia") {
      if (!value.NVIDIA_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["NVIDIA_API_KEY"],
          message: "NVIDIA_API_KEY is required when AI_PROVIDER=nvidia",
        });
      }

      if (!value.NVIDIA_MODEL) {
        ctx.addIssue({
          code: "custom",
          path: ["NVIDIA_MODEL"],
          message: "NVIDIA_MODEL is required when AI_PROVIDER=nvidia",
        });
      }
    }

    if (value.AI_PROVIDER === "openai" && !value.OPENAI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required when AI_PROVIDER=openai",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment:\n${details.join("\n")}`);
}

export const env = parsed.data;
