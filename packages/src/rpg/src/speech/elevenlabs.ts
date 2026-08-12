import { env } from "../config/env";
import type { SpeechProvider } from "./types";

export class ElevenLabsSpeechProvider implements SpeechProvider {
  readonly name = "elevenlabs" as const;

  async synthesize(text: string) {
    if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID) {
      throw new Error("ElevenLabs TTS is not configured");
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}?output_format=mp3_44100_64`,
      {
        method: "POST",
        headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) throw new Error(`ElevenLabs TTS returned ${response.status}`);
    return { audio: Buffer.from(await response.arrayBuffer()), format: "mp3" as const };
  }
}
