import { runMigrations } from "./migrate";
import { createLogger } from "../../../shared/logging/logger";

const result = await runMigrations();
createLogger("rpg").info("database.migrations_complete", result);
