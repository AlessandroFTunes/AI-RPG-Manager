import { env } from "../config/env";
import type { SpeechProvider } from "./types";

export class OpenAISpeechProvider implements SpeechProvider {
  readonly name = "openai" as const;

  async synthesize(text: string) {
    if (!env.OPENAI_API_KEY) throw new Error("OpenAI TTS is not configured");
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_TTS_MODEL,
        voice: env.OPENAI_TTS_VOICE,
        input: text,
        response_format: "wav",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`OpenAI TTS returned ${response.status}`);
    return { audio: Buffer.from(await response.arrayBuffer()), format: "wav" as const };
  }
}
