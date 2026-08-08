import { resolve } from "node:path";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { openAuditDb, listAuditEvents } from "./db.js";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
config({ path: resolve(root, "config/.env") });

/**
 * Prove SQLite is a rebuildable read-model: dump counts.
 * Full chain re-ingest lands after contract deploy addresses exist.
 */
const dbPath = resolve(root, process.env.DATABASE_PATH ?? "./data/opera-audit.sqlite");
const db = openAuditDb(dbPath);
const events = listAuditEvents(db, 1000) as Array<{ kind: string }>;
console.log(
  JSON.stringify(
    {
      ok: true,
      dbPath,
      eventCount: events.length,
      kinds: [...new Set(events.map((e) => e.kind))],
    },
    null,
    2,
  ),
);
db.close();
