import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
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
import { env } from "../config/env";
import type { AmbientTrack } from "./types";

const logger = createLogger("music");

type Session = {
  guildId: string;
  channelId: string;
  connection: VoiceConnection;
  player: AudioPlayer;
  queue: AmbientTrack[];
  current?: AmbientTrack;
  process?: ChildProcessByStdio<null, Readable, Readable>;
  emptyTimer?: ReturnType<typeof setTimeout>;
};

export class AmbientPlayer {
  private readonly sessions = new Map<string, Session>();

  getStatus(guildId: string) {
    const session = this.sessions.get(guildId);
    if (!session) return null;
    return {
      channelId: session.channelId,
      current: session.current ?? null,
      queueLength: session.queue.length,
    };
  }

  async connect(guild: Guild, channel: VoiceBasedChannel) {
    const existing = this.sessions.get(guild.id);
    if (existing?.channelId === channel.id) return existing;
    if (existing) this.leave(guild.id);

    const connection = joinVoiceChannel({
      guildId: guild.id,
      channelId: channel.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    const session: Session = {
      guildId: guild.id,
      channelId: channel.id,
      connection,
      player,
      queue: [],
    };

    connection.subscribe(player);
    player.on(AudioPlayerStatus.Idle, () => {
      this.cleanupProcess(session);
      session.current = undefined;
      void this.playNext(session);
    });
    player.on("error", (error) => {
      logger.error("music_player_error", error, { guild_id: guild.id });
      this.cleanupProcess(session);
      session.current = undefined;
      void this.playNext(session);
    });
    connection.on(VoiceConnectionStatus.Disconnected, () => {
      void Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]).catch(() => {
        if (this.sessions.get(guild.id) === session) this.leave(guild.id);
      });
    });

    this.sessions.set(guild.id, session);
    return session;
  }

  async enqueue(guild: Guild, channel: VoiceBasedChannel, track: AmbientTrack, options?: { replaceCurrent?: boolean }) {
    const session = await this.connect(guild, channel);
    if (session.emptyTimer) {
      clearTimeout(session.emptyTimer);
      session.emptyTimer = undefined;
    }

    if (options?.replaceCurrent) {
      session.queue.length = 0;
      session.queue.push(track);
      this.cleanupProcess(session);
      session.current = undefined;
      session.player.stop(true);
      return;
    }

    session.queue.push(track);
    if (!session.current) {
      void this.playNext(session);
    }
  }

  skip(guildId: string) {
    const session = this.sessions.get(guildId);
    if (!session) return false;
    this.cleanupProcess(session);
    session.current = undefined;
    session.player.stop(true);
    return true;
  }

  stop(guildId: string) {
    const session = this.sessions.get(guildId);
    if (!session) return false;
    session.queue.length = 0;
    this.cleanupProcess(session);
    session.current = undefined;
    session.player.stop(true);
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
        this.leave(guildId);
      }
    }, delayMs);
  }

  leave(guildId: string) {
    const session = this.sessions.get(guildId);
    if (!session) return false;
    if (session.emptyTimer) clearTimeout(session.emptyTimer);
    session.queue.length = 0;
    this.cleanupProcess(session);
    session.player.stop(true);
    session.connection.destroy();
    this.sessions.delete(guildId);
    return true;
  }

  destroyAll() {
    for (const guildId of [...this.sessions.keys()]) this.leave(guildId);
  }

  private cleanupProcess(session: Session) {
    if (!session.process) return;
    session.process.stdout.destroy();
    session.process.stderr.destroy();
    session.process.kill("SIGKILL");
    session.process = undefined;
  }

  private async playNext(session: Session) {
    if (session.current || session.queue.length === 0) return;
    const track = session.queue.shift();
    if (!track) return;

    const process = spawn(env.FFMPEG_BIN, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "5",
      "-i",
      track.streamUrl,
      "-vn",
      "-f",
      "s16le",
      "-ar",
      "48000",
      "-ac",
      "2",
      "pipe:1",
    ], { stdio: ["ignore", "pipe", "pipe"] });

    process.on("error", (error) => {
      logger.error("music_ffmpeg_error", error, { guild_id: session.guildId });
    });
    process.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) logger.warn("music_ffmpeg_stderr", { guild_id: session.guildId, message: text });
    });

    session.process = process;
    session.current = track;
    const resource = createAudioResource(process.stdout, { inputType: StreamType.Raw });
    session.player.play(resource);
  }
}

export const ambientPlayer = new AmbientPlayer();
