import { connect } from "node:net";
import { env } from "../config/env";
import type { SpeechProvider, SynthesizedSpeech } from "./types";
import { createWavBuffer } from "./wav";

type WyomingHeader = {
  type: string;
  data?: Record<string, unknown>;
  data_length?: number;
  payload_length?: number;
};

export class PiperSpeechProvider implements SpeechProvider {
  readonly name = "piper" as const;

  async synthesize(text: string): Promise<SynthesizedSpeech> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: env.PIPER_HOST, port: env.PIPER_PORT });
      const audioChunks: Buffer[] = [];
      let pending = Buffer.alloc(0);
      let format: { rate: number; width: number; channels: number } | null = null;
      let header: WyomingHeader | null = null;
      let headerData: Buffer | null = null;
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        callback();
      };

      const processBuffer = () => {
        while (true) {
          if (!header) {
            const newlineIndex = pending.indexOf(10);
            if (newlineIndex === -1) return;
            header = JSON.parse(pending.subarray(0, newlineIndex).toString("utf8")) as WyomingHeader;
            pending = pending.subarray(newlineIndex + 1);
          }

          const dataLength = header.data_length ?? 0;
          if (dataLength > 0 && !headerData) {
            if (pending.length < dataLength) return;
            headerData = pending.subarray(0, dataLength);
            pending = pending.subarray(dataLength);
          }

          const payloadLength = header.payload_length ?? 0;
          if (pending.length < payloadLength) return;
          const payload = pending.subarray(0, payloadLength);
          pending = pending.subarray(payloadLength);

          const data = {
            ...(header.data ?? {}),
            ...(headerData ? JSON.parse(headerData.toString("utf8")) : {}),
          } as Record<string, unknown>;
          if (header.type === "audio-start" || header.type === "audio-chunk") {
            format ??= {
              rate: Number(data.rate),
              width: Number(data.width),
              channels: Number(data.channels),
            };
          }
          if (header.type === "audio-chunk" && payload.length > 0) {
            audioChunks.push(Buffer.from(payload));
          }
          if (header.type === "audio-stop") {
            if (!format || audioChunks.length === 0) {
              finish(() => reject(new Error("Piper returned no audio")));
              return;
            }
            const audio = createWavBuffer({
              pcm: Buffer.concat(audioChunks),
              sampleRate: format.rate,
              sampleWidth: format.width,
              channels: format.channels,
            });
            finish(() => resolve({ audio, format: "wav" }));
            return;
          }

          header = null;
          headerData = null;
        }
      };

      socket.setTimeout(30_000, () => finish(() => reject(new Error("Piper synthesis timed out"))));
      socket.on("error", (error) => finish(() => reject(error)));
      socket.on("data", (chunk) => {
        pending = Buffer.concat([pending, Buffer.from(chunk)]);
        try {
          processBuffer();
        } catch (error) {
          finish(() => reject(error));
        }
      });
      socket.on("connect", () => {
        const data = Buffer.from(JSON.stringify({
          text,
          voice: { name: env.PIPER_VOICE },
          text_format: "text",
        }), "utf8");
        const event = JSON.stringify({ type: "synthesize", version: "1.8.0", data_length: data.length });
        socket.write(`${event}\n`);
        socket.write(data);
      });
    });
  }
}
