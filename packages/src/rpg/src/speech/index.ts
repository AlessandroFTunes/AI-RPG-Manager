import { env } from "../config/env";
import type { SpeechProviderName } from "../db/campaignRepository";
import { ElevenLabsSpeechProvider } from "./elevenlabs";
import { OpenAISpeechProvider } from "./openai";
import { PiperSpeechProvider } from "./piper";
import type { SpeechProvider } from "./types";

const providers: Record<SpeechProviderName, SpeechProvider> = {
  piper: new PiperSpeechProvider(),
  elevenlabs: new ElevenLabsSpeechProvider(),
  openai: new OpenAISpeechProvider(),
};

export function getSpeechProvider(name = env.TTS_PROVIDER) {
  return providers[name];
}

export type { SpeechProvider, SynthesizedSpeech } from "./types";
