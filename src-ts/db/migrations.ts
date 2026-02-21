import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./client.js";

export function runMigrations(): void {
  const db = getDb();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.resolve(here, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  db.exec(sql);

  const replayColumns = db
    .prepare("PRAGMA table_info(replay_log)")
    .all() as Array<{ name: string }>;
  const names = new Set(replayColumns.map((c) => c.name));
  if (!names.has("request_id")) {
    db.exec("ALTER TABLE replay_log ADD COLUMN request_id TEXT");
  }
  if (!names.has("actor_id")) {
    db.exec("ALTER TABLE replay_log ADD COLUMN actor_id TEXT");
  }

  const followUpColumns = db
    .prepare("PRAGMA table_info(follow_ups)")
    .all() as Array<{ name: string }>;
  const followUpNames = new Set(followUpColumns.map((c) => c.name));
  if (!followUpNames.has("retry_count")) {
    db.exec("ALTER TABLE follow_ups ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!followUpNames.has("last_error")) {
    db.exec("ALTER TABLE follow_ups ADD COLUMN last_error TEXT");
  }

  db.exec(
    `CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      window_start_ms INTEGER NOT NULL,
      count INTEGER NOT NULL
    )`
  );
}
