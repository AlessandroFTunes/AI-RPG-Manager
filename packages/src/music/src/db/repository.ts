import { sql } from "../config/database";

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
  source: "auto" | "manual";
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
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

function parseJson<T>(value: T | string) {
  return typeof value === "string" ? JSON.parse(value) as T : value;
}

function normalizeCampaign(row: Campaign): Campaign {
  return { ...row, state: parseJson<Campaign["state"]>(row.state) };
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

export async function completeMusicRequest(requestId: string, result: Record<string, unknown>) {
  const rows = await sql<MusicRequest[]>`
    update music_requests
    set status = 'completed', result = ${toSqlJson(result)}, error = null, processed_at = coalesce(processed_at, now())
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
  await sql`
    update campaigns
    set state = state || jsonb_build_object(
      'flags',
      coalesce(state -> 'flags', '{}'::jsonb) || jsonb_build_object('music', ${toSqlJson(flags)})
    )
    where id = ${campaignId}
  `;
}
