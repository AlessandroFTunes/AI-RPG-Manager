import {
  createMusicRequest,
  getOpenMusicRequestByCampaign,
  getRecentCampaignMessages,
  updateCampaignMusicFlags,
  type Campaign,
  type MusicRequestSource,
} from "../db/campaignRepository";
import {
  MUSIC_CONTRACT_VERSION,
  parseMusicRequestContext,
  type MusicEnergy,
} from "../../../shared/music/contracts";
import { createLogger } from "../../../shared/logging/logger";

const MUSIC_REQUEST_COOLDOWN_MS = 15 * 60_000;
const logger = createLogger("rpg");

type QueueAmbientMusicInput = {
  requestedBy?: string;
  source?: MusicRequestSource;
  indication?: string;
  mood?: string;
  energy?: MusicEnergy;
  sceneType?: string;
  reason: string;
  replaceCurrent?: boolean;
  force?: boolean;
};

function readRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readDate(value: unknown) {
  const text = readString(value);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time);
}

function getMusicFlags(campaign: Campaign) {
  return readRecord(readRecord(campaign.state.flags).music);
}

export async function queueAmbientMusicRequest(campaign: Campaign, input: QueueAmbientMusicInput) {
  if (!campaign.state.voice.enabled || !campaign.state.voice.channelId) {
    return { success: false, queued: false, skipped: "voice_disabled" as const };
  }

  const currentFlags = getMusicFlags(campaign);
  if (!input.force && readBoolean(currentFlags.autoEnabled) === false) {
    return { success: false, queued: false, skipped: "auto_disabled" as const };
  }

  const openRequest = await getOpenMusicRequestByCampaign(campaign.id);
  if (openRequest) {
    return { success: true, queued: false, skipped: "request_pending" as const, requestId: openRequest.id };
  }

  const now = new Date();
  const cooldownUntil = readDate(currentFlags.cooldownUntil);
  if (!input.force && cooldownUntil && cooldownUntil.getTime() > now.getTime()) {
    return { success: true, queued: false, skipped: "cooldown" as const, cooldownUntil: cooldownUntil.toISOString() };
  }

  const recentMessages = await getRecentCampaignMessages(campaign.id, 24);
  const request = await createMusicRequest({
    campaignId: campaign.id,
    guildId: campaign.guild_id,
    threadId: campaign.thread_id,
    voiceChannelId: campaign.state.voice.channelId,
    requestedBy: input.requestedBy,
    source: input.source ?? "auto",
    indication: readString(input.indication),
    reason: input.reason,
    replaceCurrent: input.replaceCurrent,
    context: parseMusicRequestContext({
      version: MUSIC_CONTRACT_VERSION,
      campaign: {
        title: campaign.title,
        system: campaign.system,
        tone: campaign.state.setup.tone,
        premise: campaign.state.setup.premise,
        summary: campaign.state.summary,
        currentScene: campaign.state.currentScene,
        characters: campaign.state.characters.map((character) => character.name),
        themeHint: readString(currentFlags.themeHint),
      },
      request: {
        indication: readString(input.indication),
        mood: readString(input.mood),
        energy: input.energy,
        sceneType: readString(input.sceneType),
        reason: input.reason,
        replaceCurrent: input.replaceCurrent ?? false,
      },
      recentMessages: recentMessages.map((message) => ({
        role: message.role,
        authorName: message.author_name,
        content: message.content.slice(0, 500),
      })),
    }),
  });

  const themeHint = readString(input.indication) ?? readString(currentFlags.themeHint);
  const nextMusicFlags = {
    ...currentFlags,
    autoEnabled: readBoolean(currentFlags.autoEnabled) ?? true,
    ...(themeHint ? { themeHint } : {}),
    pendingRequestId: request.id,
    lastRequestAt: now.toISOString(),
    lastReason: input.reason,
    cooldownUntil: new Date(now.getTime() + MUSIC_REQUEST_COOLDOWN_MS).toISOString(),
  };

  await updateCampaignMusicFlags(campaign.id, nextMusicFlags);
  logger.info("music_request_queued", {
    campaign_id: campaign.id,
    operation_key: request.id,
    source: request.source,
  });

  return { success: true, queued: true, requestId: request.id, skipped: null };
}
