import { sql } from "../config/database";

export type CampaignStatus = "active" | "closed";
export type CampaignMessageRole = "user" | "assistant" | "system" | "tool";

export type CampaignCharacter = {
  id: string;
  name: string;
  description?: string;
  status?: string;
};

export type CampaignNpc = CampaignCharacter & {
  relationship?: number;
  notes?: string[];
};

export type CampaignLocation = {
  id: string;
  name: string;
  description?: string;
  visited?: boolean;
};

export type CampaignQuest = {
  id: string;
  title: string;
  status: "active" | "completed" | "failed";
  description?: string;
};

export type CampaignInventoryItem = {
  id: string;
  name: string;
  quantity: number;
};

export type CampaignState = {
  system: string;
  summary: string;
  currentScene: string;
  characters: CampaignCharacter[];
  npcs: CampaignNpc[];
  locations: CampaignLocation[];
  quests: CampaignQuest[];
  inventory: CampaignInventoryItem[];
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

export type CampaignEvent = {
  id: string;
  campaign_id: string;
  type: string;
  actor_id: string | null;
  data: Record<string, unknown>;
  importance: number;
  created_at: Date;
};

export type CampaignStatePatch = Partial<Omit<CampaignState, "flags">> & {
  flags?: Record<string, unknown>;
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

type SaveEventInput = {
  campaignId: string;
  type: string;
  actorId?: string;
  data?: Record<string, unknown>;
  importance?: number;
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

function normalizeEvent(row: CampaignEvent): CampaignEvent {
  return {
    ...row,
    data: parseJson<Record<string, unknown>>(row.data),
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

export async function patchCampaignState(campaignId: string, patch: CampaignStatePatch) {
  const rows = await sql<Campaign[]>`
    update campaigns
    set state = state || ${toSqlJson(patch)} || jsonb_build_object(
      'flags',
      coalesce(state -> 'flags', '{}'::jsonb) || coalesce(${toSqlJson(patch.flags ?? {})}, '{}'::jsonb)
    )
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
  const rows = await sql<(CampaignMessage & { inserted: boolean })[]>`
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
    on conflict (discord_message_id) where discord_message_id is not null do nothing
    returning *, true as inserted
  `;

  if (rows[0]) {
    return { ...normalizeMessage(rows[0]), inserted: true };
  }

  const existingRows = await sql<CampaignMessage[]>`
    select * from messages where discord_message_id = ${input.discordMessageId ?? null} limit 1
  `;
  const existing = existingRows[0];
  return existing ? { ...normalizeMessage(existing), inserted: false } : null;
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

export async function saveCampaignEvent(input: SaveEventInput) {
  const rows = await sql<CampaignEvent[]>`
    insert into events (campaign_id, type, actor_id, data, importance)
    values (
      ${input.campaignId},
      ${input.type},
      ${input.actorId ?? null},
      ${toSqlJson(input.data ?? {})},
      ${input.importance ?? 1}
    )
    returning *
  `;

  return normalizeEvent(rows[0]);
}

export async function getRecentCampaignEvents(campaignId: string, limit = 20) {
  const rows = await sql<CampaignEvent[]>`
    select * from events
    where campaign_id = ${campaignId}
    order by created_at desc
    limit ${limit}
  `;

  return rows.reverse().map(normalizeEvent);
}
