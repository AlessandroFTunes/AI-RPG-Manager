import type { SpeechProviderName } from "../db/campaignRepository";

export type SynthesizedSpeech = {
  audio: Buffer;
  format: "wav" | "mp3";
};

export interface SpeechProvider {
  readonly name: SpeechProviderName;
  synthesize(text: string): Promise<SynthesizedSpeech>;
}
