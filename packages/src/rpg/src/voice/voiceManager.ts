import { Readable } from "node:stream";
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type VoiceConnection,
} from "@discordjs/voice";
import type { Guild, VoiceBasedChannel } from "discord.js";
import { createLogger } from "../../../shared/logging/logger";
import type { SpeechProviderName } from "../db/campaignRepository";
import { getSpeechProvider } from "../speech";
import { compactSpeechQueue, sanitizeSpeechText } from "./sanitizeSpeech";
import type { VoiceSegment } from "./segments";
import { transformVoice } from "./transformVoice";

const logger = createLogger("rpg");

const MAX_PENDING_SPEECH = 3;

type VoiceSession = {
  guildId: string;
  channelId: string;
  provider: SpeechProviderName;
  connection: VoiceConnection;
  player: AudioPlayer;
  pending: VoiceSegment[][];
  activeSegments: VoiceSegment[];
  playing: boolean;
  summarizing: boolean;
  emptyTimer?: ReturnType<typeof setTimeout>;
};

type VoiceQueueSummarizer = (contents: string[]) => Promise<string>;

export class VoiceManager {
  private readonly sessions = new Map<string, VoiceSession>();
  private summarizer: VoiceQueueSummarizer = async (contents) => compactSpeechQueue(contents);

  setSummarizer(summarizer: VoiceQueueSummarizer) {
    this.summarizer = summarizer;
  }

  getSession(guildId: string) {
    return this.sessions.get(guildId);
  }

  async connect(guild: Guild, channel: VoiceBasedChannel, provider: SpeechProviderName) {
    const existing = this.sessions.get(guild.id);
    if (existing?.channelId === channel.id) return existing;
    if (existing) this.disconnect(guild.id);

    const connection = joinVoiceChannel({
      guildId: guild.id,
      channelId: channel.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    const session: VoiceSession = {
      guildId: guild.id,
      channelId: channel.id,
      provider,
      connection,
      player,
      pending: [],
      activeSegments: [],
      playing: false,
      summarizing: false,
    };
    connection.subscribe(player);
    player.on(AudioPlayerStatus.Idle, () => {
      session.playing = false;
      void this.playNext(session);
    });
    player.on("error", (error) => {
      logger.error("voice_player_error", error, { guild_id: guild.id });
      session.playing = false;
      void this.playNext(session);
    });
    connection.on(VoiceConnectionStatus.Disconnected, () => {
      session.playing = false;
      void Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]).catch(() => {
        if (this.sessions.get(guild.id) === session) this.disconnect(guild.id);
      });
    });
    this.sessions.set(guild.id, session);
    return session;
  }

  async enqueue(guildId: string, content: string | VoiceSegment[]) {
    const session = this.sessions.get(guildId);
    const segments = (typeof content === "string" ? [{ speaker: "narrator" as const, text: content }] : content)
      .filter((segment) => segment.speak !== false)
      .map((segment) => ({ ...segment, text: sanitizeSpeechText(segment.text) }))
      .filter((segment) => segment.text);
    if (!session || segments.length === 0) return false;

    session.pending.push(segments);
    if (session.pending.length > MAX_PENDING_SPEECH && !session.summarizing) {
      void this.summarizePending(session);
    }

    void this.playNext(session);
    return true;
  }

  scheduleDisconnectIfEmpty(guildId: string, channel: VoiceBasedChannel, delayMs = 5 * 60_000) {
    const session = this.sessions.get(guildId);
    if (!session || session.channelId !== channel.id) return;
    if (channel.members.some((member) => !member.user.bot)) {
      if (session.emptyTimer) clearTimeout(session.emptyTimer);
      session.emptyTimer = undefined;
      return;
    }
    if (session.emptyTimer) return;
    session.emptyTimer = setTimeout(() => {
      const current = this.sessions.get(guildId);
      if (current?.channelId === channel.id && !channel.members.some((member) => !member.user.bot)) {
        this.disconnect(guildId);
      }
    }, delayMs);
  }

  disconnect(guildId: string) {
    const session = this.sessions.get(guildId);
    if (!session) return;
    if (session.emptyTimer) clearTimeout(session.emptyTimer);
    session.pending.length = 0;
    session.activeSegments.length = 0;
    session.player.stop(true);
    session.connection.destroy();
    this.sessions.delete(guildId);
  }

  destroyAll() {
    for (const guildId of [...this.sessions.keys()]) this.disconnect(guildId);
  }

  private async playNext(session: VoiceSession) {
    if (session.playing || session.summarizing) return;
    if (session.activeSegments.length === 0) {
      const scene = session.pending.shift();
      if (!scene) return;
      session.activeSegments.push(...scene);
    }
    session.playing = true;
    const segment = session.activeSegments.shift()!;

    try {
      const speech = await getSpeechProvider(session.provider).synthesize(segment.text);
      let audio = speech.audio;
      if (speech.format === "wav" && segment.profile && segment.profile !== "narrator") {
        try {
          audio = await transformVoice(audio, segment.profile);
        } catch (error) {
          logger.warn("voice_profile_transform_failed", {
            guild_id: session.guildId,
            profile: segment.profile,
            error,
          });
        }
      }
      const resource = createAudioResource(Readable.from([audio]), {
        inputType: StreamType.Arbitrary,
      });
      session.player.play(resource);
    } catch (error) {
      logger.error("voice_synthesis_failed", error, { guild_id: session.guildId });
      session.playing = false;
      void this.playNext(session);
    }
  }

  private async summarizePending(session: VoiceSession) {
    if (session.summarizing || session.pending.length <= MAX_PENDING_SPEECH) return;
    session.summarizing = true;
    const scenes = session.pending.splice(0);
    const contents = scenes.map((scene) => scene.map((segment) => segment.text).join(" "));
    try {
      const summary = sanitizeSpeechText(await this.summarizer(contents));
      session.pending.unshift([{ speaker: "narrator", profile: "narrator", text: summary || compactSpeechQueue(contents) }]);
    } catch (error) {
      logger.warn("voice_queue_summary_failed", { guild_id: session.guildId, error });
      session.pending.unshift([{ speaker: "narrator", profile: "narrator", text: compactSpeechQueue(contents) }]);
    } finally {
      session.summarizing = false;
      if (session.pending.length > MAX_PENDING_SPEECH) {
        void this.summarizePending(session);
      } else {
        void this.playNext(session);
      }
    }
  }
}

export const voiceManager = new VoiceManager();
