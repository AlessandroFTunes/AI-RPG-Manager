import { describe, expect, test } from "bun:test";
import { createWavBuffer } from "../speech/wav";
import { transformVoice } from "./transformVoice";

describe("transformVoice", () => {
  test("keeps narrator audio unchanged", async () => {
    const wav = createWavBuffer({ pcm: Buffer.alloc(4_000), sampleRate: 22_050, sampleWidth: 2, channels: 1 });
    expect(await transformVoice(wav, "narrator")).toBe(wav);
  });

  test("produces valid transformed WAV audio", async () => {
    const pcm = Buffer.alloc(22_050 * 2);
    const wav = createWavBuffer({ pcm, sampleRate: 22_050, sampleWidth: 2, channels: 1 });
    const transformed = await transformVoice(wav, "deep");

    expect(transformed.subarray(0, 4).toString()).toBe("RIFF");
    expect(transformed.length).toBeGreaterThan(44);
  });
});
