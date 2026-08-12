import { sql } from "../config/database";

export type CampaignStatus = "active" | "closed";
export type CampaignMessageRole = "user" | "assistant" | "system" | "tool";

export type CampaignState = {
  system: string;
  summary: string;
  currentScene: string;
  characters: unknown[];
  npcs: unknown[];
  locations: unknown[];
  quests: unknown[];
  inventory: unknown[];
  flags: Record<string, unknown>;
  [key: string]: unknown;
};

export type Campaign = {
  id: string;
  guild_id: string;
  channel_id: string;
  thread_id: string;
  owner_id: string;
  title: string;
  system: string;
  status: CampaignStatus;
  state: CampaignState;
  created_at: Date;
  updated_at: Date;
};

export type CampaignMessage = {
  id: string;
  campaign_id: string;
  discord_message_id: string | null;
  author_id: string | null;
  author_name: string | null;
  role: CampaignMessageRole;
  content: string;
  metadata: Record<string, unknown>;
  created_at: Date;
};

type CreateCampaignInput = {
  guildId: string;
  channelId: string;
  threadId: string;
  ownerId: string;
  title: string;
  system: string;
};

type SaveMessageInput = {
  campaignId: string;
  discordMessageId?: string;
  authorId?: string;
  authorName?: string;
  role: CampaignMessageRole;
  content: string;
  metadata?: Record<string, unknown>;
};

function parseJson<T>(value: T | string): T {
  if (typeof value !== "string") return value;

  return JSON.parse(value) as T;
}

function normalizeCampaign(row: Campaign): Campaign {
  return {
    ...row,
    state: parseJson<CampaignState>(row.state),
  };
}

function normalizeMessage(row: CampaignMessage): CampaignMessage {
  return {
    ...row,
    metadata: parseJson<Record<string, unknown>>(row.metadata),
  };
}

function toSqlJson(value: unknown) {
  return sql.json(value as never);
}

export function createInitialCampaignState(system: string): CampaignState {
  return {
    system,
    summary: "",
    currentScene: "",
    characters: [],
    npcs: [],
    locations: [],
    quests: [],
    inventory: [],
    flags: {},
  };
}

export async function createCampaign(input: CreateCampaignInput) {
  const state = createInitialCampaignState(input.system);
  const rows = await sql<Campaign[]>`
    insert into campaigns (guild_id, channel_id, thread_id, owner_id, title, system, state)
    values (
      ${input.guildId},
      ${input.channelId},
      ${input.threadId},
      ${input.ownerId},
      ${input.title},
      ${input.system},
      ${toSqlJson(state)}
    )
    returning *
  `;

  return normalizeCampaign(rows[0]);
}

export async function getCampaignById(campaignId: string) {
  const rows = await sql<Campaign[]>`
    select * from campaigns where id = ${campaignId} limit 1
  `;

  return rows[0] ? normalizeCampaign(rows[0]) : null;
}

export async function getCampaignByThread(threadId: string) {
  const rows = await sql<Campaign[]>`
    select * from campaigns where thread_id = ${threadId} limit 1
  `;

  return rows[0] ? normalizeCampaign(rows[0]) : null;
}

export async function getActiveCampaignByThread(threadId: string) {
  const rows = await sql<Campaign[]>`
    select * from campaigns
    where thread_id = ${threadId} and status = 'active'
    limit 1
  `;

  return rows[0] ? normalizeCampaign(rows[0]) : null;
}

export async function patchCampaignState(campaignId: string, patch: Record<string, unknown>) {
  const rows = await sql<Campaign[]>`
    update campaigns
    set state = state || ${toSqlJson(patch)}
    where id = ${campaignId}
    returning *
  `;

  return rows[0] ? normalizeCampaign(rows[0]) : null;
}

export async function replaceCampaignState(campaignId: string, state: CampaignState) {
  const rows = await sql<Campaign[]>`
    update campaigns
    set state = ${toSqlJson(state)}
    where id = ${campaignId}
    returning *
  `;

  return rows[0] ? normalizeCampaign(rows[0]) : null;
}

export async function closeCampaign(campaignId: string) {
  const rows = await sql<Campaign[]>`
    update campaigns
    set status = 'closed'
    where id = ${campaignId}
    returning *
  `;

  return rows[0] ? normalizeCampaign(rows[0]) : null;
}

export async function saveCampaignMessage(input: SaveMessageInput) {
  const rows = await sql<CampaignMessage[]>`
    insert into messages (
      campaign_id,
      discord_message_id,
      author_id,
      author_name,
      role,
      content,
      metadata
    ) values (
      ${input.campaignId},
      ${input.discordMessageId ?? null},
      ${input.authorId ?? null},
      ${input.authorName ?? null},
      ${input.role},
      ${input.content},
      ${toSqlJson(input.metadata ?? {})}
    )
    returning *
  `;

  return normalizeMessage(rows[0]);
}

export async function getRecentCampaignMessages(campaignId: string, limit = 20) {
  const rows = await sql<CampaignMessage[]>`
    select * from messages
    where campaign_id = ${campaignId}
    order by created_at desc
    limit ${limit}
  `;

  return rows.reverse().map(normalizeMessage);
}

export async function saveDiceRoll(input: {
  campaignId: string;
  authorId?: string;
  expression: string;
  result: Record<string, unknown>;
}) {
  const rows = await sql<{ id: string }[]>`
    insert into dice_rolls (campaign_id, author_id, expression, result)
    values (${input.campaignId}, ${input.authorId ?? null}, ${input.expression}, ${toSqlJson(input.result)})
    returning id
  `;

  return rows[0];
}
