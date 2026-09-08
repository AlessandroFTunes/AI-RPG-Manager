import { lockSql, sql } from "../config/database";
import {
  parseMusicRequestContext,
  parseMusicRequestResult,
  parseMusicRequestSource,
  parseMusicRequestStatus,
  type MusicRequestContext,
  type MusicRequestResult,
  type MusicRequestSource,
  type MusicRequestStatus,
} from "../../../shared/music/contracts";
import { parseCampaignState } from "../../../rpg/src/db/campaignStateSchema";

export type Campaign = {
  id: string;
  guild_id: string;
  channel_id: string;
  thread_id: string;
  owner_id: string;
  title: string;
  system: string;
  status: "active" | "closed";
  state: {
    setup: { tone: string; premise: string; boundaries: string[] };
    summary: string;
    currentScene: string;
    voice: { enabled: boolean; channelId: string | null; provider: string };
    flags: Record<string, unknown>;
    [key: string]: unknown;
  };
  created_at: Date;
  updated_at: Date;
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
  result: MusicRequestResult | Record<string, never>;
  error: string | null;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function parseJson<T>(value: T | string) {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

function normalizeCampaign(row: Campaign): Campaign {
  return { ...row, state: parseJson<Campaign["state"]>(row.state) };
}

function normalizeMusicRequest(row: MusicRequest): MusicRequest {
  if (row.contract_version !== 1) throw new Error(`Unsupported music contract version: ${row.contract_version}`);
  const status = parseMusicRequestStatus(row.status);
  const rawResult = parseJson<unknown>(row.result);
  return {
    ...row,
    source: parseMusicRequestSource(row.source),
    status,
    context: parseMusicRequestContext(parseJson<unknown>(row.context)),
    result: status === "completed" ? parseMusicRequestResult(rawResult) : {},
  };
}

function toSqlJson(value: unknown) {
  return sql.json(value as never);
}

export async function claimNextMusicRequest() {
  return sql.begin(async (transaction) => {
    const rows = await transaction<MusicRequest[]>`
      select * from music_requests
      where status = 'pending'
      order by created_at asc
      limit 1
      for update skip locked
    `;
    if (!rows[0]) return null;

    const updatedRows = await transaction<MusicRequest[]>`
      update music_requests
      set status = 'processing', processed_at = now()
      where id = ${rows[0].id}
      returning *
    `;

    return normalizeMusicRequest(updatedRows[0]);
  });
}

export async function completeMusicRequest(requestId: string, result: MusicRequestResult) {
  const validatedResult = parseMusicRequestResult(result);
  const rows = await sql<MusicRequest[]>`
    update music_requests
    set status = 'completed', result = ${toSqlJson(validatedResult)}, error = null, processed_at = coalesce(processed_at, now())
    where id = ${requestId}
    returning *
  `;

  return rows[0] ? normalizeMusicRequest(rows[0]) : null;
}

export async function failMusicRequest(requestId: string, error: string, result: Record<string, unknown> = {}) {
  const rows = await sql<MusicRequest[]>`
    update music_requests
    set status = 'failed', error = ${error}, result = ${toSqlJson(result)}, processed_at = coalesce(processed_at, now())
    where id = ${requestId}
    returning *
  `;

  return rows[0] ? normalizeMusicRequest(rows[0]) : null;
}

export async function getCampaignById(campaignId: string) {
  const rows = await sql<Campaign[]>`
    select * from campaigns where id = ${campaignId} limit 1
  `;

  return rows[0] ? normalizeCampaign(rows[0]) : null;
}

export async function setCampaignMusicFlags(campaignId: string, flags: Record<string, unknown>) {
  const connection = await lockSql.reserve();
  const lockKey = `rpg:campaign:${campaignId}`;
  let locked = false;
  try {
    await connection`select pg_advisory_lock(hashtextextended(${lockKey}, 0))`;
    locked = true;
    await connection.unsafe("begin");
    try {
      const rows = await connection<Array<{ id: string; state: unknown }>>`
        select id, state from campaigns where id = ${campaignId} for update
      `;
      if (rows[0]) {
        const state = parseCampaignState(rows[0].state, campaignId);
        const nextState = parseCampaignState({
          ...state,
          flags: { ...state.flags, music: flags },
        }, campaignId);
        await connection`
          update campaigns set state = ${toSqlJson(nextState)} where id = ${campaignId}
        `;
      }
      await connection.unsafe("commit");
    } catch (error) {
      await connection.unsafe("rollback");
      throw error;
    }
  } finally {
    try {
      if (locked) await connection`select pg_advisory_unlock(hashtextextended(${lockKey}, 0))`;
    } finally {
      connection.release();
    }
  }
}
