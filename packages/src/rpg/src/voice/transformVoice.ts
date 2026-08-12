import { spawn } from "node:child_process";
import type { VoiceProfile } from "../db/campaignRepository";

const filters: Record<VoiceProfile, string | null> = {
  narrator: null,
  deep: "rubberband=pitch=0.84,atempo=0.96,bass=g=5",
  high: "rubberband=pitch=1.18,atempo=1.04,treble=g=3",
  elder: "rubberband=pitch=0.92,atempo=0.84,lowpass=f=6500",
  young: "rubberband=pitch=1.10,atempo=1.08,treble=g=2",
  dark: "rubberband=pitch=0.76,atempo=0.90,bass=g=7,lowpass=f=5500",
  energetic: "rubberband=pitch=1.04,atempo=1.16,treble=g=4",
};

export function transformVoice(audio: Buffer, profile: VoiceProfile) {
  const filter = filters[profile];
  if (!filter) return Promise.resolve(audio);

  return new Promise<Buffer>((resolve, reject) => {
    const process = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-i", "pipe:0",
      "-af", filter,
      "-f", "wav",
      "pipe:1",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    process.stdout.on("data", (chunk) => output.push(Buffer.from(chunk)));
    process.stderr.on("data", (chunk) => errors.push(Buffer.from(chunk)));
    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0 && output.length > 0) resolve(Buffer.concat(output));
      else reject(new Error(Buffer.concat(errors).toString("utf8") || `FFmpeg exited with ${code}`));
    });
    process.stdin.end(audio);
  });
}
