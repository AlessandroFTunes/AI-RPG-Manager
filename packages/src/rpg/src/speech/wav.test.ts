import { describe, expect, test } from "bun:test";
import { createWavBuffer } from "./wav";

describe("createWavBuffer", () => {
  test("creates a PCM WAV header", () => {
    const pcm = Buffer.alloc(100);
    const wav = createWavBuffer({ pcm, sampleRate: 22_050, sampleWidth: 2, channels: 1 });

    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(22_050);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.length).toBe(144);
  });
});
