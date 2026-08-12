import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabase, sql } from "../config/database";

const currentDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(currentDir, "schema.sql");
const schema = await Bun.file(schemaPath).text();

try {
  await sql.unsafe(schema);
  console.log("RPG database schema applied.");
} finally {
  await closeDatabase();
}
