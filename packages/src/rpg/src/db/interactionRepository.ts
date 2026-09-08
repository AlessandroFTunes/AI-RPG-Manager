import { sql } from "../config/database";

export type InteractionStatus = "pending" | "processing" | "completed" | "failed";

export type InteractionRecord = {
  id: string;
  campaign_id: string | null;
  external_id: string;
  kind: string;
  status: InteractionStatus;
  actor_id: string | null;
  input: Record<string, unknown> | string;
  result: Record<string, unknown> | string;
  error: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  attempt_count: number;
  lease_expires_at: Date | null;
};

export async function claimInteraction(input: {
  externalId: string;
  campaignId?: string;
  kind: string;
  actorId?: string;
}) {
  return sql.begin(async (transaction) => {
    const inserted = await transaction<InteractionRecord[]>`
      insert into interactions (
        campaign_id, external_id, kind, status, actor_id, lease_expires_at
      )
      values (
        ${input.campaignId ?? null}, ${input.externalId}, ${input.kind},
        'processing', ${input.actorId ?? null}, now() + interval '5 minutes'
      )
      on conflict (external_id) where external_id is not null do nothing
      returning *
    `;
    if (inserted[0]) return { claimed: true as const, interaction: inserted[0] };

    const existing = await transaction<InteractionRecord[]>`
      select * from interactions where external_id = ${input.externalId} limit 1
    `;
    if (!existing[0]) throw new Error("Interaction conflict without persisted interaction");
    const interaction = existing[0];
    const hasEffects = await transaction<{ has_effects: boolean }[]>`
      select (
        exists(select 1 from interaction_effects where interaction_id = ${interaction.id})
        or exists(select 1 from messages where interaction_id = ${interaction.id})
        or exists(select 1 from dice_rolls where interaction_id = ${interaction.id})
        or exists(select 1 from events where interaction_id = ${interaction.id})
        or exists(select 1 from music_requests where interaction_id = ${interaction.id})
      ) as has_effects
    `;
    const leaseExpired = !interaction.lease_expires_at
      || interaction.lease_expires_at.getTime() <= Date.now();
    const retryable = !hasEffects[0]?.has_effects && (
      interaction.status === "failed"
      || (interaction.status === "processing" && leaseExpired)
    );
    if (!retryable) return { claimed: false as const, interaction };

    const reclaimed = await transaction<InteractionRecord[]>`
      update interactions
      set
        status = 'processing',
        error = null,
        completed_at = null,
        attempt_count = attempt_count + 1,
        lease_expires_at = now() + interval '5 minutes'
      where id = ${interaction.id}
      returning *
    `;
    return { claimed: true as const, interaction: reclaimed[0] };
  });
}

export async function completeInteraction(interactionId: string) {
  await sql`
    update interactions
    set status = 'completed', result = ${sql.json({ completed: true })}, error = null, completed_at = now()
    where id = ${interactionId} and status = 'processing'
  `;
}

export async function failInteraction(interactionId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await sql`
    update interactions
    set status = 'failed', error = ${message.slice(0, 2_000)}, completed_at = now()
    where id = ${interactionId} and status = 'processing'
  `;
}
