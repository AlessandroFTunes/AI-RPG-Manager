import postgres from "postgres";
import { env } from "./env";

export const sql = postgres(env.DATABASE_URL, {
  max: 5,
  prepare: false,
});

export const lockSql = postgres(env.DATABASE_URL, {
  max: 5,
  prepare: false,
});

export async function closeDatabase() {
  await Promise.all([
    sql.end({ timeout: 5 }),
    lockSql.end({ timeout: 5 }),
  ]);
}
