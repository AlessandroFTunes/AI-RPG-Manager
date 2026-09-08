import { lockSql } from "../config/database";
import {
  claimInteraction,
  completeInteraction,
  failInteraction,
  type InteractionStatus,
} from "../db/interactionRepository";
import { createLogger, runWithLogContext } from "../../../shared/logging/logger";
import { runWithInteractionContext } from "./context";

const logger = createLogger("rpg");

export type InteractionRunResult<T> =
  | { duplicate: false; value: T }
  | { duplicate: true; status: InteractionStatus };

export function campaignLockKey(campaignId: string) {
  return `rpg:campaign:${campaignId}`;
}

export function guildCreationLockKey(guildId: string) {
  return `rpg:guild-campaign-create:${guildId}`;
}

export async function withAdvisoryLock<T>(lockKey: string, callback: () => Promise<T>) {
  const connection = await lockSql.reserve();
  const startedAt = performance.now();
  let locked = false;
  try {
    await connection`select pg_advisory_lock(hashtextextended(${lockKey}, 0))`;
    locked = true;
    const waitDuration = Math.round(performance.now() - startedAt);
    if (waitDuration > 50) logger.info("interaction.lock_wait", { duration_ms: waitDuration });
    return await callback();
  } finally {
    try {
      if (locked) await connection`select pg_advisory_unlock(hashtextextended(${lockKey}, 0))`;
    } finally {
      connection.release();
    }
  }
}

export async function runPersistentInteraction<T>(input: {
  externalId: string;
  campaignId?: string;
  actorId?: string;
  kind: string;
  lockKey: string;
}, callback: () => Promise<T>): Promise<InteractionRunResult<T>> {
  return runWithLogContext({
    campaign_id: input.campaignId,
    interaction_id: input.externalId,
  }, () => withAdvisoryLock(input.lockKey, async () => {
    const startedAt = performance.now();
    const claim = await claimInteraction(input);
    if (!claim.claimed) {
      logger.info("interaction.duplicate", { status: claim.interaction.status });
      return { duplicate: true, status: claim.interaction.status };
    }

    logger.info("interaction.started", { kind: input.kind });
    try {
      const value = await runWithInteractionContext(claim.interaction.id, callback);
      await completeInteraction(claim.interaction.id);
      logger.info("interaction.completed", {
        kind: input.kind,
        duration_ms: Math.round(performance.now() - startedAt),
      });
      return { duplicate: false, value };
    } catch (error) {
      await failInteraction(claim.interaction.id, error);
      logger.error("interaction.failed", error, {
        kind: input.kind,
        duration_ms: Math.round(performance.now() - startedAt),
      });
      throw error;
    }
  }));
}
