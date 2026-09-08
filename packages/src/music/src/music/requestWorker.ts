import type { Client } from "discord.js";
import { MUSIC_CONTRACT_VERSION, parseMusicRequestResult } from "../../../shared/music/contracts";
import { createLogger, runWithLogContext } from "../../../shared/logging/logger";
import { env } from "../config/env";
import {
  claimNextMusicRequest,
  completeMusicRequest,
  failMusicRequest,
  getCampaignById,
  setCampaignMusicFlags,
  type MusicRequest,
} from "../db/repository";
import { ambientPlayer } from "./player";
import { generateAmbientPlan } from "./provider";
import { chooseAmbientTrack } from "./youtube";

let timer: ReturnType<typeof setInterval> | undefined;
let running = false;
const logger = createLogger("music");

function readRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function updateMusicFlags(campaignId: string, currentFlags: Record<string, unknown>, patch: Record<string, unknown>) {
  await setCampaignMusicFlags(campaignId, { ...currentFlags, ...patch });
}

async function announceSelection(client: Client<true>, request: MusicRequest, content: string) {
  try {
    const channel = await client.channels.fetch(request.thread_id);
    if (channel?.isSendable()) {
      await channel.send(content);
    }
  } catch {
    // Ignore announcement failures.
  }
}

async function processRequest(client: Client<true>, request: MusicRequest) {
  const startedAt = Date.now();
  const campaign = await getCampaignById(request.campaign_id);
  if (!campaign || campaign.status !== "active") {
    await failMusicRequest(request.id, "Campaign is not active anymore");
    return;
  }
  if (!campaign.state.voice.enabled || !campaign.state.voice.channelId) {
    await failMusicRequest(request.id, "Campaign voice channel is disabled");
    return;
  }

  const guild = client.guilds.cache.get(request.guild_id) ?? await client.guilds.fetch(request.guild_id);
  const channel = guild.channels.cache.get(request.voice_channel_id) ?? await guild.channels.fetch(request.voice_channel_id);
  if (!channel?.isVoiceBased()) {
    await failMusicRequest(request.id, "Voice channel not available");
    return;
  }

  const currentFlags = readRecord(readRecord(campaign.state.flags).music);

  try {
    const plan = await generateAmbientPlan(campaign, request);
    const track = await chooseAmbientTrack(plan.youtubeQuery, plan.avoidTerms);
    await ambientPlayer.enqueue(guild, channel, {
      title: track.title,
      webpageUrl: track.webpageUrl,
      streamUrl: track.streamUrl,
      durationSeconds: track.durationSeconds,
      query: plan.youtubeQuery,
      mood: plan.mood,
    }, { replaceCurrent: request.replace_current });

    const result = parseMusicRequestResult({ version: MUSIC_CONTRACT_VERSION, plan, track });
    await completeMusicRequest(request.id, result);
    await updateMusicFlags(campaign.id, currentFlags, {
      pendingRequestId: null,
      lastAppliedAt: new Date().toISOString(),
      lastMood: plan.mood,
      lastQuery: plan.youtubeQuery,
      lastTrackTitle: track.title,
      lastTrackUrl: track.webpageUrl,
    });
    await announceSelection(
      client,
      request,
      `Ambiente instrumental: **${plan.sceneType}**\nClima: ${plan.mood}\nTocando: ${track.title}\n${track.webpageUrl}`,
    );
    logger.info("music_request_completed", { duration_ms: Date.now() - startedAt, track: track.title });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown music worker error";
    await failMusicRequest(request.id, message);
    await updateMusicFlags(campaign.id, currentFlags, {
      pendingRequestId: null,
      lastErrorAt: new Date().toISOString(),
      lastError: message,
    });
    logger.error("music_request_failed", error, { duration_ms: Date.now() - startedAt });
  }
}

async function poll(client: Client<true>) {
  if (running) return;
  running = true;
  try {
    const request = await claimNextMusicRequest();
    if (!request) return;
    await runWithLogContext({
      campaign_id: request.campaign_id,
      operation_key: request.id,
    }, () => processRequest(client, request));
  } finally {
    running = false;
  }
}

export function startMusicRequestWorker(client: Client<true>) {
  if (timer) return;
  void poll(client);
  timer = setInterval(() => {
    void poll(client);
  }, env.MUSIC_REQUEST_POLL_INTERVAL_MS);
}

export function stopMusicRequestWorker() {
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
}
