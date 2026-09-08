import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import { createLogger } from "../../../shared/logging/logger";

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(currentDir, "migrations");
const workspaceEnvPath = resolve(currentDir, "../../../../../.env");
const advisoryLockId = 7_341_920_260_816;
const migrationFilePattern = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const logger = createLogger("migration");

export type Migration = {
  version: number;
  name: string;
  fileName: string;
  checksum: string;
  sql: string;
};

export function parseMigrationFileName(fileName: string) {
  const match = migrationFilePattern.exec(fileName);
  if (!match) return null;

  return { version: Number(match[1]), name: match[2] };
}

export function calculateChecksum(contents: string) {
  return createHash("sha256").update(contents).digest("hex");
}

export async function loadMigrations(directory = migrationsDir): Promise<Migration[]> {
  const fileNames = (await readdir(directory))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  const migrations = await Promise.all(fileNames.map(async (fileName) => {
    const parsed = parseMigrationFileName(fileName);
    if (!parsed) throw new Error(`Invalid migration filename: ${fileName}`);

    const sql = await Bun.file(resolve(directory, fileName)).text();
    return { ...parsed, fileName, sql, checksum: calculateChecksum(sql) };
  }));

  for (let index = 0; index < migrations.length; index += 1) {
    const expectedVersion = index + 1;
    if (migrations[index].version !== expectedVersion) {
      throw new Error(
        `Migration versions must be contiguous: expected ${expectedVersion}, found ${migrations[index].version}`,
      );
    }
  }

  return migrations;
}

function databaseUrl() {
  loadEnv({ path: workspaceEnvPath, override: false });
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error(`DATABASE_URL is required (checked ${workspaceEnvPath})`);
  return value;
}

export async function runMigrations() {
  const migrations = await loadMigrations();
  const sql = postgres(databaseUrl(), { max: 1, prepare: false });
  let applied = 0;

  try {
    const connection = await sql.reserve();
    let locked = false;

    try {
      await connection`select pg_advisory_lock(${advisoryLockId})`;
      locked = true;
      await connection`
        create table if not exists schema_migrations (
          version integer primary key,
          name text not null,
          checksum text not null,
          applied_at timestamptz not null default now()
        )
      `;

      const ledger = await connection<Array<{
        version: number;
        name: string;
        checksum: string;
      }>>`select version, name, checksum from schema_migrations order by version`;
      const byVersion = new Map(ledger.map((entry) => [entry.version, entry]));

      for (const entry of ledger) {
        const migration = migrations.find((candidate) => candidate.version === entry.version);
        if (!migration) throw new Error(`Applied migration ${entry.version} is missing from disk`);
        if (entry.name !== migration.name || entry.checksum !== migration.checksum) {
          throw new Error(`Applied migration ${migration.fileName} has been modified`);
        }
      }

      for (const migration of migrations) {
        if (byVersion.has(migration.version)) continue;

        await connection.unsafe("begin");
        try {
          await connection.unsafe(migration.sql);
          await connection`
            insert into schema_migrations (version, name, checksum)
            values (${migration.version}, ${migration.name}, ${migration.checksum})
          `;
          await connection.unsafe("commit");
        } catch (error) {
          await connection.unsafe("rollback");
          throw error;
        }
        applied += 1;
        logger.info("database.migration_applied", {
          migration_version: migration.version,
          migration_name: migration.name,
        });
      }

      return { applied, total: migrations.length };
    } finally {
      try {
        if (locked) await connection`select pg_advisory_unlock(${advisoryLockId})`;
      } finally {
        connection.release();
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
