# AI RPG Manager

Discord RPG manager bot using Bun, TypeScript, Discord.js, PostgreSQL JSONB, and the Vercel AI SDK.

The bots live as isolated packages:

- `packages/src/rpg`: campaign narrator bot
- `packages/src/music`: ambient instrumental music bot

## Features

- Discord slash command `/rpg`
- Campaign per Discord thread
- Free-form player messages inside active campaign threads
- NVIDIA Build/NIM provider through an OpenAI-compatible endpoint
- Optional OpenAI provider for development
- PostgreSQL persistence with JSONB campaign state
- Deterministic dice rolls in code
- AI tools for campaign state, dice, player questions, and important memories
- Automatic ambient music requests from the campaign bot to the music bot

## Setup

Create a root `.env` file based on `packages/src/rpg/.env.example` and `packages/src/music/.env.example`.

Required values:

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=

MUSIC_DISCORD_TOKEN=
MUSIC_DISCORD_CLIENT_ID=
MUSIC_DISCORD_GUILD_ID=

DATABASE_URL=

AI_PROVIDER=nvidia
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=

OPENROUTER_API_KEY=
MUSIC_OPENROUTER_MODEL=openrouter/free

YTDLP_BIN=yt-dlp
FFMPEG_BIN=ffmpeg
```

Do not commit `.env`.

Install `yt-dlp` in the host system before running the music bot.

## Commands

From `packages/src/rpg`:

```bash
bun install
bun run db:migrate
bun run commands
bun run dev
```

From `packages/src/music`:

```bash
bun install
bun run db:migrate
bun run commands
bun run dev
```

## Discord

Enable `Message Content Intent` in the Discord Developer Portal for the RPG bot so it can read free-form player actions inside RPG threads.
