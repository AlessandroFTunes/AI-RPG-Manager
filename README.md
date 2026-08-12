# AI RPG Manager

Discord RPG manager bot using Bun, TypeScript, Discord.js, PostgreSQL JSONB, and the Vercel AI SDK.

The RPG bot lives in `packages/src/rpg` as an isolated package.

## Features

- Discord slash command `/rpg`
- Campaign per Discord thread
- Free-form player messages inside active campaign threads
- NVIDIA Build/NIM provider through an OpenAI-compatible endpoint
- Optional OpenAI provider for development
- PostgreSQL persistence with JSONB campaign state
- Deterministic dice rolls in code
- AI tools for campaign state, dice, player questions, and important memories

## Setup

Create a root `.env` file based on `packages/src/rpg/.env.example`.

Required values:

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=

DATABASE_URL=

AI_PROVIDER=nvidia
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=
```

Do not commit `.env`.

## Commands

From `packages/src/rpg`:

```bash
bun install
bun run db:migrate
bun run commands
bun run dev
```

## Discord

Enable `Message Content Intent` in the Discord Developer Portal so the bot can read free-form player actions inside RPG threads.
