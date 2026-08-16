import { spawn } from "node:child_process";
import { env } from "../config/env";

type YouTubeEntry = {
  id?: string;
  title?: string;
  duration?: number;
};

type YouTubeSearchResult = {
  entries?: YouTubeEntry[];
};

type SelectedTrack = {
  title: string;
  webpageUrl: string;
  streamUrl: string;
  durationSeconds?: number;
};

function runCommand(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

function scoreEntry(entry: YouTubeEntry, avoidTerms: string[]) {
  const title = (entry.title ?? "").toLowerCase();
  let score = 0;
  if (title.includes("ambient") || title.includes("ambience")) score += 4;
  if (title.includes("instrumental") || title.includes("soundtrack")) score += 3;
  if (title.includes("no vocals") || title.includes("no lyric")) score += 3;
  if (title.includes("background")) score += 2;
  if (typeof entry.duration === "number" && entry.duration >= 600) score += 2;
  if (typeof entry.duration === "number" && entry.duration >= 1800) score += 1;
  if (avoidTerms.some((term) => title.includes(term.toLowerCase()))) score -= 8;
  return score;
}

async function searchYoutube(query: string) {
  const { stdout } = await runCommand(env.YTDLP_BIN, [
    "--dump-single-json",
    "--flat-playlist",
    "--no-warnings",
    "--ignore-config",
    `ytsearch8:${query}`,
  ]);
  return JSON.parse(stdout) as YouTubeSearchResult;
}

async function getStreamUrl(webpageUrl: string) {
  const { stdout } = await runCommand(env.YTDLP_BIN, [
    "--get-url",
    "-f",
    "bestaudio[ext=m4a]/bestaudio/best",
    "--no-warnings",
    "--ignore-config",
    webpageUrl,
  ]);
  const url = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!url) throw new Error("yt-dlp returned no audio URL");
  return url;
}

export async function chooseAmbientTrack(query: string, avoidTerms: string[]) {
  const result = await searchYoutube(query);
  const candidates = (result.entries ?? [])
    .filter((entry) => entry.id && entry.title)
    .sort((left, right) => scoreEntry(right, avoidTerms) - scoreEntry(left, avoidTerms));
  const selected = candidates[0];
  if (!selected?.id || !selected.title) {
    throw new Error(`No YouTube result found for query: ${query}`);
  }

  const webpageUrl = `https://www.youtube.com/watch?v=${selected.id}`;
  const streamUrl = await getStreamUrl(webpageUrl);
  return {
    title: selected.title,
    webpageUrl,
    streamUrl,
    durationSeconds: selected.duration,
  } satisfies SelectedTrack;
}
