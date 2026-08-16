import { sql } from "../config/database";
import {
  adjustRelationships,
  type CampaignRelationship,
  type RelationshipDeltas,
  type RelationshipParty,
} from "../relationships/relationships";
import {
  advanceWorldClock,
  createInitialWorldClock,
  type WorldClock,
  type WorldDuration,
} from "../world/worldClock";

export type CampaignStatus = "active" | "closed";
export type CampaignMessageRole = "user" | "assistant" | "system" | "tool";
export type CampaignPhase = "setup" | "playing";
export type CampaignRuleset = "narrative" | "dnd5e-2014" | "dnd5e-2024";
export type SpeechProviderName = "piper" | "elevenlabs" | "openai";
export type VoiceProfile = "narrator" | "deep" | "high" | "elder" | "young" | "dark" | "energetic";
export type MusicRequestSource = "auto" | "manual";
export type MusicRequestStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export type VoiceCastMember = {
  npcId: string;
  name: string;
  profile: Exclude<VoiceProfile, "narrator">;
  appearances: number;
  importance: "supporting" | "main";
};

export type CampaignVoice = {
  enabled: boolean;
  channelId: string | null;
  provider: SpeechProviderName;
};

export type CampaignCharacter = {
  id: string;
  playerId?: string;
  playerName?: string;
  name: string;
  description?: string;
  status?: string;
};

export type CampaignSetup = {
  premise: string;
  tone: string;
  boundaries: string[];
};

export type CampaignNpc = CampaignCharacter & {
  /** @deprecated Use CampaignState.relationships for directional relationships. */
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
  ruleset: CampaignRuleset;
  phase: CampaignPhase;
  setup: CampaignSetup;
  voice: CampaignVoice;
  voiceCast: Record<string, VoiceCastMember>;
  summary: string;
  currentScene: string;
  characters: CampaignCharacter[];
  npcs: CampaignNpc[];
  locations: CampaignLocation[];
  quests: CampaignQuest[];
  inventory: CampaignInventoryItem[];
  relationships: CampaignRelationship[];
  worldClock: WorldClock;
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

export type MusicRequest = {
  id: string;
  campaign_id: string;
  guild_id: string;
  thread_id: string;
  voice_channel_id: string;
  requested_by: string | null;
  source: MusicRequestSource;
  status: MusicRequestStatus;
  indication: string | null;
  reason: string;
  replace_current: boolean;
  context: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string | null;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
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
  ruleset: CampaignRuleset;
  voice?: CampaignVoice;
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
  const state = parseJson<CampaignState>(row.state);

  return {
    ...row,
    state: {
      ...state,
      ruleset: state.ruleset ?? "narrative",
      phase: state.phase ?? "playing",
      setup: state.setup ?? { premise: "", tone: "", boundaries: [] },
      voice: state.voice ?? { enabled: false, channelId: null, provider: "piper" },
      voiceCast: state.voiceCast ?? {},
      relationships: state.relationships ?? [],
      worldClock: state.worldClock ?? createInitialWorldClock(),
    },
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

function normalizeMusicRequest(row: MusicRequest): MusicRequest {
  return {
    ...row,
    context: parseJson<Record<string, unknown>>(row.context),
    result: parseJson<Record<string, unknown>>(row.result),
  };
}

function toSqlJson(value: unknown) {
  return sql.json(value as never);
}

function toWorldClockEventSnapshot(clock: WorldClock) {
  return {
    year: clock.year,
    month: clock.month,
    day: clock.day,
    hour: clock.hour,
    minute: clock.minute,
    weekdayIndex: clock.weekdayIndex,
    elapsedMinutes: clock.elapsedMinutes,
  };
}

export function createInitialCampaignState(
  system: string,
  ruleset: CampaignRuleset,
  voice: CampaignVoice = { enabled: false, channelId: null, provider: "piper" },
): CampaignState {
  return {
    system,
    ruleset,
    phase: "setup",
    setup: {
      premise: "",
      tone: "",
      boundaries: [],
    },
    voice,
    voiceCast: {},
    summary: "",
    currentScene: "",
    characters: [],
    npcs: [],
    locations: [],
    quests: [],
    inventory: [],
    relationships: [],
    worldClock: createInitialWorldClock(),
    flags: {},
  };
}

export async function createCampaign(input: CreateCampaignInput) {
  const state = createInitialCampaignState(input.system, input.ruleset, input.voice);
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

export async function getActiveVoiceCampaigns() {
  const rows = await sql<Campaign[]>`
    select * from campaigns
    where status = 'active'
      and state -> 'voice' ->> 'enabled' = 'true'
      and state -> 'voice' ->> 'channelId' is not null
    order by updated_at desc
  `;

  return rows.map(normalizeCampaign);
}

export async function getActiveVoiceCampaignByGuild(guildId: string) {
  const rows = await sql<Campaign[]>`
    select * from campaigns
    where guild_id = ${guildId}
      and status = 'active'
      and state -> 'voice' ->> 'enabled' = 'true'
    order by updated_at desc
    limit 1
  `;

  return rows[0] ? normalizeCampaign(rows[0]) : null;
}

export async function getOpenMusicRequestByCampaign(campaignId: string) {
  const rows = await sql<MusicRequest[]>`
    select * from music_requests
    where campaign_id = ${campaignId}
      and status in ('pending', 'processing')
    order by created_at desc
    limit 1
  `;

  return rows[0] ? normalizeMusicRequest(rows[0]) : null;
}

export async function createMusicRequest(input: {
  campaignId: string;
  guildId: string;
  threadId: string;
  voiceChannelId: string;
  requestedBy?: string;
  source?: MusicRequestSource;
  indication?: string;
  reason: string;
  replaceCurrent?: boolean;
  context?: Record<string, unknown>;
}) {
  const rows = await sql<MusicRequest[]>`
    insert into music_requests (
      campaign_id,
      guild_id,
      thread_id,
      voice_channel_id,
      requested_by,
      source,
      indication,
      reason,
      replace_current,
      context
    ) values (
      ${input.campaignId},
      ${input.guildId},
      ${input.threadId},
      ${input.voiceChannelId},
      ${input.requestedBy ?? null},
      ${input.source ?? 'auto'},
      ${input.indication ?? null},
      ${input.reason},
      ${input.replaceCurrent ?? false},
      ${toSqlJson(input.context ?? {})}
    )
    returning *
  `;

  return normalizeMusicRequest(rows[0]);
}

const npcVoiceProfiles: VoiceCastMember["profile"][] = [
  "deep",
  "high",
  "elder",
  "young",
  "dark",
  "energetic",
];

function getNpcVoiceProfile(npcId: string) {
  let hash = 0;
  for (const character of npcId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return npcVoiceProfiles[hash % npcVoiceProfiles.length];
}

export function updateVoiceCast(
  currentVoiceCast: Record<string, VoiceCastMember>,
  npcs: Array<{ npcId: string; name: string }>,
) {
  const voiceCast = { ...currentVoiceCast };
  const uniqueNpcs = [...new Map(npcs.map((npc) => [npc.npcId, npc])).values()];
  for (const npc of uniqueNpcs) {
    const existing = voiceCast[npc.npcId];
    const appearances = (existing?.appearances ?? 0) + 1;
    voiceCast[npc.npcId] = {
      npcId: npc.npcId,
      name: existing?.name ?? npc.name,
      profile: existing?.profile ?? getNpcVoiceProfile(npc.npcId),
      appearances,
      importance: appearances >= 5 ? "main" : "supporting",
    };
  }
  return voiceCast;
}

export async function registerNpcVoiceAppearances(
  campaignId: string,
  npcs: Array<{ npcId: string; name: string }>,
) {
  if (npcs.length === 0) return {};

  return sql.begin(async (transaction) => {
    const rows = await transaction<Campaign[]>`
      select * from campaigns where id = ${campaignId} for update
    `;
    if (!rows[0]) return {};

    const campaign = normalizeCampaign(rows[0]);
    const voiceCast = updateVoiceCast(campaign.state.voiceCast, npcs);

    await transaction`
      update campaigns
      set state = jsonb_set(state, '{voiceCast}', ${toSqlJson(voiceCast)}, true)
      where id = ${campaignId}
    `;
    return voiceCast;
  });
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

export async function patchCampaignSetup(campaignId: string, patch: Partial<CampaignSetup>) {
  const rows = await sql<Campaign[]>`
    update campaigns
    set state = jsonb_set(
      state,
      '{setup}',
      coalesce(state -> 'setup', '{}'::jsonb) || ${toSqlJson(patch)},
      true
    )
    where id = ${campaignId} and state ->> 'phase' = 'setup'
    returning *
  `;

  return rows[0] ? normalizeCampaign(rows[0]) : null;
}

export async function adjustCampaignRelationship(input: {
  campaignId: string;
  actorId?: string;
  source: RelationshipParty;
  target: RelationshipParty;
  deltas: RelationshipDeltas;
  reason: string;
}) {
  return sql.begin(async (transaction) => {
    const rows = await transaction<Campaign[]>`
      select * from campaigns where id = ${input.campaignId} for update
    `;
    if (!rows[0]) return null;

    const campaign = normalizeCampaign(rows[0]);
    const result = adjustRelationships(campaign.state.relationships, {
      source: input.source,
      target: input.target,
      deltas: input.deltas,
    });

    await transaction`
      update campaigns
      set state = jsonb_set(state, '{relationships}', ${toSqlJson(result.relationships)}, true)
      where id = ${input.campaignId}
    `;
    await transaction`
      insert into events (campaign_id, type, actor_id, data, importance)
      values (
        ${input.campaignId},
        'relationship_changed',
        ${input.actorId ?? null},
        ${toSqlJson({
          relationshipId: result.relationship.id,
          source: input.source,
          target: input.target,
          deltas: input.deltas,
          reason: input.reason,
        })},
        3
      )
    `;

    return result.relationship;
  });
}

export async function advanceCampaignWorldClock(input: {
  campaignId: string;
  actorId?: string;
  duration: WorldDuration;
  reason: string;
}) {
  return sql.begin(async (transaction) => {
    const rows = await transaction<Campaign[]>`
      select * from campaigns where id = ${input.campaignId} for update
    `;
    if (!rows[0]) return null;

    const campaign = normalizeCampaign(rows[0]);
    const before = campaign.state.worldClock;
    const after = advanceWorldClock(before, input.duration);

    await transaction`
      update campaigns
      set state = jsonb_set(state, '{worldClock}', ${toSqlJson(after)}, true)
      where id = ${input.campaignId}
    `;
    await transaction`
      insert into events (campaign_id, type, actor_id, data, importance)
      values (
        ${input.campaignId},
        'world_clock_advanced',
        ${input.actorId ?? null},
        ${toSqlJson({
          duration: input.duration,
          reason: input.reason,
          before: toWorldClockEventSnapshot(before),
          after: toWorldClockEventSnapshot(after),
        })},
        2
      )
    `;

    return { before, after };
  });
}

export async function upsertPlayerCharacter(campaignId: string, character: CampaignCharacter) {
  if (!character.playerId) throw new Error("Player character requires playerId");

  const rows = await sql<Campaign[]>`
    update campaigns
    set state = jsonb_set(
      state,
      '{characters}',
      coalesce(
        (
          select jsonb_agg(existing_character)
          from jsonb_array_elements(coalesce(state -> 'characters', '[]'::jsonb)) as existing_character
          where existing_character ->> 'playerId' is distinct from ${character.playerId}
        ),
        '[]'::jsonb
      ) || jsonb_build_array(${toSqlJson(character)}),
      true
    )
    where id = ${campaignId} and state ->> 'phase' = 'setup'
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
