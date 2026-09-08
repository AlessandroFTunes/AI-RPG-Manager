import { runMigrations } from "../../../rpg/src/db/migrate";
import { createLogger } from "../../../shared/logging/logger";

const result = await runMigrations();
createLogger("music").info("database.migrations_complete", result);
