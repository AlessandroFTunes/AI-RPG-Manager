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
import {
  parseMusicRequestContext,
  parseMusicRequestSource,
  parseMusicRequestStatus,
  type MusicRequestContext,
  type MusicRequestSource,
  type MusicRequestStatus,
} from "../../../shared/music/contracts";
import { parseCampaignState } from "./campaignStateSchema";
import { nextInteractionEffect } from "../interactions/context";
import { parsePersistentRecord } from "./persistenceSchemas";

export type CampaignStatus = "active" | "closed";
export type CampaignMessageRole = "user" | "assistant" | "system" | "tool";
export type CampaignPhase = "setup" | "playing";
export type CampaignRuleset = "narrative" | "dnd5e-2014" | "dnd5e-2024";
export type SpeechProviderName = "piper" | "elevenlabs" | "openai";
export type VoiceProfile = "narrator" | "deep" | "high" | "elder" | "young" | "dark" | "energetic";
export type { MusicRequestSource, MusicRequestStatus } from "../../../shared/music/contracts";

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
  stateVersion: 1;
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
  contract_version: number;
  context: MusicRequestContext;
  result: Record<string, unknown>;
  error: string | null;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
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
  return {
    ...row,
    state: parseCampaignState(parseJson<unknown>(row.state), row.id) as CampaignState,
  };
}

function normalizeMessage(row: CampaignMessage): CampaignMessage {
  return {
    ...row,
    metadata: parsePersistentRecord(parseJson<unknown>(row.metadata), "message metadata"),
  };
}

function normalizeEvent(row: CampaignEvent): CampaignEvent {
  return {
    ...row,
    data: parsePersistentRecord(parseJson<unknown>(row.data), "event data"),
  };
}

function normalizeMusicRequest(row: MusicRequest): MusicRequest {
  if (row.contract_version !== 1) throw new Error(`Unsupported music contract version: ${row.contract_version}`);
  return {
    ...row,
    source: parseMusicRequestSource(row.source),
    status: parseMusicRequestStatus(row.status),
    context: parseMusicRequestContext(parseJson<unknown>(row.context)),
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
    stateVersion: 1,
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
  context: MusicRequestContext;
}) {
  const context = parseMusicRequestContext(input.context);
  const source = parseMusicRequestSource(input.source ?? "auto");
  const effect = nextInteractionEffect("music_request");
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
      context,
      interaction_id,
      operation_key
    ) values (
      ${input.campaignId},
      ${input.guildId},
      ${input.threadId},
      ${input.voiceChannelId},
      ${input.requestedBy ?? null},
      ${source},
      ${input.indication ?? null},
      ${input.reason},
      ${input.replaceCurrent ?? false},
      ${toSqlJson(context)},
      ${effect.interactionId},
      ${effect.operationKey}
    )
    on conflict do nothing
    returning *
  `;
  if (rows[0]) return normalizeMusicRequest(rows[0]);
  const existing = await sql<MusicRequest[]>`
    select * from music_requests
    where interaction_id = ${effect.interactionId} and operation_key = ${effect.operationKey}
    limit 1
  `;
  if (existing[0]) return normalizeMusicRequest(existing[0]);
  const openRequest = await sql<MusicRequest[]>`
    select * from music_requests
    where campaign_id = ${input.campaignId} and status in ('pending', 'processing')
    order by created_at asc
    limit 1
  `;
  if (!openRequest[0]) throw new Error("Music request conflict without persisted request");
  return normalizeMusicRequest(openRequest[0]);
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
  const effect = nextInteractionEffect("npc_voice_appearances");

  return sql.begin(async (transaction) => {
    const rows = await transaction<Campaign[]>`
      select * from campaigns where id = ${campaignId} for update
    `;
    if (!rows[0]) return {};

    const campaign = normalizeCampaign(rows[0]);
    if (effect.interactionId && effect.operationKey) {
      const duplicate = await transaction<{ id: string }[]>`
        select id from interaction_effects
        where interaction_id = ${effect.interactionId} and operation_key = ${effect.operationKey}
        limit 1
      `;
      if (duplicate[0]) return campaign.state.voiceCast;
    }
    const voiceCast = updateVoiceCast(campaign.state.voiceCast, npcs);
    const state = parseCampaignState({ ...campaign.state, voiceCast }, campaignId);

    await transaction`
      update campaigns
      set state = ${toSqlJson(state)}
      where id = ${campaignId}
    `;
    if (effect.interactionId && effect.operationKey) {
      await transaction`
        insert into interaction_effects (interaction_id, operation_key, effect_type, data)
        values (
          ${effect.interactionId}, ${effect.operationKey}, 'npc_voice_appearances',
          ${toSqlJson({ npcIds: npcs.map((npc) => npc.npcId) })}
        )
      `;
    }
    return voiceCast;
  });
}

async function mutateCampaignState(input: {
  campaignId: string;
  actorId?: string;
  eventType: string;
  reason: string;
  eventData?: Record<string, unknown>;
  mutate: (state: CampaignState) => CampaignState;
}) {
  const effect = nextInteractionEffect(input.eventType);
  return sql.begin(async (transaction) => {
    const rows = await transaction<Campaign[]>`
      select * from campaigns where id = ${input.campaignId} for update
    `;
    if (!rows[0]) return null;
    const campaign = normalizeCampaign(rows[0]);
    if (effect.interactionId && effect.operationKey) {
      const existingEffect = await transaction<{ id: string }[]>`
        select id from interaction_effects
        where interaction_id = ${effect.interactionId} and operation_key = ${effect.operationKey}
        limit 1
      `;
      if (existingEffect[0]) return campaign;
    }
    const state = parseCampaignState(input.mutate(campaign.state), input.campaignId);
    const updated = await transaction<Campaign[]>`
      update campaigns set state = ${toSqlJson(state)} where id = ${input.campaignId} returning *
    `;
    await transaction`
      insert into events (
        campaign_id, type, actor_id, data, importance, interaction_id, operation_key
      )
      values (
        ${input.campaignId}, ${input.eventType}, ${input.actorId ?? null},
        ${toSqlJson({ reason: input.reason, ...(input.eventData ?? {}) })}, 2,
        ${effect.interactionId}, ${effect.operationKey}
      )
    `;
    if (effect.interactionId && effect.operationKey) {
      await transaction`
        insert into interaction_effects (interaction_id, operation_key, effect_type, data)
        values (
          ${effect.interactionId}, ${effect.operationKey}, ${input.eventType},
          ${toSqlJson({ campaignId: input.campaignId, reason: input.reason })}
        )
      `;
    }
    return normalizeCampaign(updated[0]);
  });
}

export function updateCampaignNarrative(input: {
  campaignId: string;
  actorId?: string;
  summary?: string;
  currentScene?: string;
  phase?: CampaignPhase;
  reason: string;
}) {
  return mutateCampaignState({
    ...input,
    eventType: "narrative_state_changed",
    eventData: { summaryChanged: input.summary !== undefined, sceneChanged: input.currentScene !== undefined },
    mutate: (state) => ({
      ...state,
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.currentScene !== undefined ? { currentScene: input.currentScene } : {}),
      ...(input.phase !== undefined ? { phase: input.phase } : {}),
    }),
  });
}

export function upsertCampaignNpc(input: {
  campaignId: string;
  actorId?: string;
  npc: CampaignNpc;
  reason: string;
}) {
  return mutateCampaignState({
    ...input,
    eventType: "npc_upserted",
    eventData: { npcId: input.npc.id },
    mutate: (state) => {
      const existing = state.npcs.find((npc) => npc.id === input.npc.id);
      return {
        ...state,
        npcs: [...state.npcs.filter((npc) => npc.id !== input.npc.id), { ...existing, ...input.npc }],
      };
    },
  });
}

export function upsertCampaignLocation(input: {
  campaignId: string;
  actorId?: string;
  location: CampaignLocation;
  reason: string;
}) {
  return mutateCampaignState({
    ...input,
    eventType: "location_upserted",
    eventData: { locationId: input.location.id },
    mutate: (state) => {
      const existing = state.locations.find((location) => location.id === input.location.id);
      return {
        ...state,
        locations: [
          ...state.locations.filter((location) => location.id !== input.location.id),
          { ...existing, ...input.location },
        ],
      };
    },
  });
}

export function upsertCampaignQuest(input: {
  campaignId: string;
  actorId?: string;
  quest: CampaignQuest;
  reason: string;
}) {
  return mutateCampaignState({
    ...input,
    eventType: "quest_upserted",
    eventData: { questId: input.quest.id, status: input.quest.status },
    mutate: (state) => {
      const existing = state.quests.find((quest) => quest.id === input.quest.id);
      return {
        ...state,
        quests: [...state.quests.filter((quest) => quest.id !== input.quest.id), { ...existing, ...input.quest }],
      };
    },
  });
}

export function changeCampaignInventory(input: {
  campaignId: string;
  actorId?: string;
  item: Omit<CampaignInventoryItem, "quantity">;
  quantityDelta: number;
  reason: string;
}) {
  if (!Number.isSafeInteger(input.quantityDelta) || input.quantityDelta === 0) {
    throw new Error("A alteração de quantidade deve ser um inteiro diferente de zero.");
  }

  return mutateCampaignState({
    ...input,
    eventType: "inventory_changed",
    eventData: { itemId: input.item.id, quantityDelta: input.quantityDelta },
    mutate: (state) => {
      const existing = state.inventory.find((item) => item.id === input.item.id);
      const quantity = (existing?.quantity ?? 0) + input.quantityDelta;
      if (quantity < 0) throw new Error("O inventário não possui quantidade suficiente.");
      const inventory = state.inventory.filter((item) => item.id !== input.item.id);
      if (quantity > 0) inventory.push({ ...input.item, quantity });
      return { ...state, inventory };
    },
  });
}

export function updateCampaignMusicFlags(campaignId: string, music: Record<string, unknown>) {
  return mutateCampaignState({
    campaignId,
    eventType: "music_state_changed",
    reason: "Estado do diretor musical atualizado.",
    mutate: (state) => ({ ...state, flags: { ...state.flags, music } }),
  });
}

export async function patchCampaignSetup(campaignId: string, patch: Partial<CampaignSetup>) {
  return sql.begin(async (transaction) => {
    const rows = await transaction<Campaign[]>`select * from campaigns where id = ${campaignId} for update`;
    if (!rows[0]) return null;
    const campaign = normalizeCampaign(rows[0]);
    if (campaign.state.phase !== "setup") return null;
    const state = parseCampaignState({
      ...campaign.state,
      setup: { ...campaign.state.setup, ...patch },
    }, campaignId);
    const updated = await transaction<Campaign[]>`
      update campaigns set state = ${toSqlJson(state)} where id = ${campaignId} returning *
    `;
    return normalizeCampaign(updated[0]);
  });
}

export async function adjustCampaignRelationship(input: {
  campaignId: string;
  actorId?: string;
  source: RelationshipParty;
  target: RelationshipParty;
  deltas: RelationshipDeltas;
  reason: string;
}) {
  const effect = nextInteractionEffect("relationship_changed");
  return sql.begin(async (transaction) => {
    const rows = await transaction<Campaign[]>`
      select * from campaigns where id = ${input.campaignId} for update
    `;
    if (!rows[0]) return null;

    const campaign = normalizeCampaign(rows[0]);
    if (effect.interactionId && effect.operationKey) {
      const duplicate = await transaction<{ id: string }[]>`
        select id from interaction_effects
        where interaction_id = ${effect.interactionId} and operation_key = ${effect.operationKey}
        limit 1
      `;
      if (duplicate[0]) {
        const id = `${input.source.type}:${input.source.id}->${input.target.type}:${input.target.id}`;
        return campaign.state.relationships.find((relationship) => relationship.id === id) ?? null;
      }
    }
    const result = adjustRelationships(campaign.state.relationships, {
      source: input.source,
      target: input.target,
      deltas: input.deltas,
    });
    const state = parseCampaignState({
      ...campaign.state,
      relationships: result.relationships,
    }, input.campaignId);

    await transaction`
      update campaigns
      set state = ${toSqlJson(state)}
      where id = ${input.campaignId}
    `;
    await transaction`
      insert into events (
        campaign_id, type, actor_id, data, importance, interaction_id, operation_key
      )
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
        3,
        ${effect.interactionId},
        ${effect.operationKey}
      )
    `;
    if (effect.interactionId && effect.operationKey) {
      await transaction`
        insert into interaction_effects (interaction_id, operation_key, effect_type, data)
        values (
          ${effect.interactionId}, ${effect.operationKey}, 'relationship_changed',
          ${toSqlJson({ relationshipId: result.relationship.id })}
        )
      `;
    }

    return result.relationship;
  });
}

export async function advanceCampaignWorldClock(input: {
  campaignId: string;
  actorId?: string;
  duration: WorldDuration;
  reason: string;
}) {
  const effect = nextInteractionEffect("world_clock_advanced");
  return sql.begin(async (transaction) => {
    const rows = await transaction<Campaign[]>`
      select * from campaigns where id = ${input.campaignId} for update
    `;
    if (!rows[0]) return null;

    const campaign = normalizeCampaign(rows[0]);
    if (effect.interactionId && effect.operationKey) {
      const duplicate = await transaction<{ id: string }[]>`
        select id from interaction_effects
        where interaction_id = ${effect.interactionId} and operation_key = ${effect.operationKey}
        limit 1
      `;
      if (duplicate[0]) {
        return { before: campaign.state.worldClock, after: campaign.state.worldClock };
      }
    }
    const before = campaign.state.worldClock;
    const after = advanceWorldClock(before, input.duration);
    const state = parseCampaignState({ ...campaign.state, worldClock: after }, input.campaignId);

    await transaction`
      update campaigns
      set state = ${toSqlJson(state)}
      where id = ${input.campaignId}
    `;
    await transaction`
      insert into events (
        campaign_id, type, actor_id, data, importance, interaction_id, operation_key
      )
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
        2,
        ${effect.interactionId},
        ${effect.operationKey}
      )
    `;
    if (effect.interactionId && effect.operationKey) {
      await transaction`
        insert into interaction_effects (interaction_id, operation_key, effect_type, data)
        values (
          ${effect.interactionId}, ${effect.operationKey}, 'world_clock_advanced',
          ${toSqlJson({ before: toWorldClockEventSnapshot(before), after: toWorldClockEventSnapshot(after) })}
        )
      `;
    }

    return { before, after };
  });
}

export async function upsertPlayerCharacter(campaignId: string, character: CampaignCharacter) {
  if (!character.playerId) throw new Error("Player character requires playerId");

  return sql.begin(async (transaction) => {
    const rows = await transaction<Campaign[]>`select * from campaigns where id = ${campaignId} for update`;
    if (!rows[0]) return null;
    const campaign = normalizeCampaign(rows[0]);
    if (campaign.state.phase !== "setup") return null;
    const characters = campaign.state.characters.filter((existing) => existing.playerId !== character.playerId);
    characters.push(character);
    const state = parseCampaignState({ ...campaign.state, characters }, campaignId);
    const updated = await transaction<Campaign[]>`
      update campaigns set state = ${toSqlJson(state)} where id = ${campaignId} returning *
    `;
    return normalizeCampaign(updated[0]);
  });
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
  const effect = nextInteractionEffect(`message_${input.role}`);
  const metadata = parsePersistentRecord(input.metadata ?? {}, "message metadata");
  const rows = await sql<(CampaignMessage & { inserted: boolean })[]>`
    insert into messages (
      campaign_id,
      discord_message_id,
      author_id,
      author_name,
      role,
      content,
      metadata,
      interaction_id,
      operation_key
    ) values (
      ${input.campaignId},
      ${input.discordMessageId ?? null},
      ${input.authorId ?? null},
      ${input.authorName ?? null},
      ${input.role},
      ${input.content},
      ${toSqlJson(metadata)},
      ${effect.interactionId},
      ${effect.operationKey}
    )
    on conflict do nothing
    returning *, true as inserted
  `;

  if (rows[0]) {
    return { ...normalizeMessage(rows[0]), inserted: true };
  }

  const existingRows = input.discordMessageId
    ? await sql<CampaignMessage[]>`
        select * from messages where discord_message_id = ${input.discordMessageId} limit 1
      `
    : await sql<CampaignMessage[]>`
        select * from messages
        where interaction_id = ${effect.interactionId} and operation_key = ${effect.operationKey}
        limit 1
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
  const effect = nextInteractionEffect("dice_roll");
  const result = parsePersistentRecord(input.result, "dice result");
  const rows = await sql<{ id: string; result: Record<string, unknown> | string }[]>`
    insert into dice_rolls (
      campaign_id, author_id, expression, result, interaction_id, operation_key
    )
    values (
      ${input.campaignId}, ${input.authorId ?? null}, ${input.expression}, ${toSqlJson(result)},
      ${effect.interactionId}, ${effect.operationKey}
    )
    on conflict do nothing
    returning id, result
  `;
  if (rows[0]) return { ...rows[0], result: parseJson(rows[0].result) };
  const existing = await sql<{ id: string; result: Record<string, unknown> | string }[]>`
    select id, result from dice_rolls
    where interaction_id = ${effect.interactionId} and operation_key = ${effect.operationKey}
    limit 1
  `;
  if (!existing[0]) throw new Error("Dice roll conflict without persisted roll");
  return { ...existing[0], result: parseJson(existing[0].result) };
}

export async function saveCampaignEvent(input: SaveEventInput) {
  const effect = nextInteractionEffect(`event_${input.type}`);
  const data = parsePersistentRecord(input.data ?? {}, "event data");
  const rows = await sql<CampaignEvent[]>`
    insert into events (
      campaign_id, type, actor_id, data, importance, interaction_id, operation_key
    )
    values (
      ${input.campaignId},
      ${input.type},
      ${input.actorId ?? null},
      ${toSqlJson(data)},
      ${input.importance ?? 1},
      ${effect.interactionId},
      ${effect.operationKey}
    )
    on conflict do nothing
    returning *
  `;
  if (rows[0]) return normalizeEvent(rows[0]);
  const existing = await sql<CampaignEvent[]>`
    select * from events
    where interaction_id = ${effect.interactionId} and operation_key = ${effect.operationKey}
    limit 1
  `;
  if (!existing[0]) throw new Error("Event conflict without persisted event");
  return normalizeEvent(existing[0]);
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
