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
  if (!followUpNames.has("provider_message_id")) {
    db.exec("ALTER TABLE follow_ups ADD COLUMN provider_message_id TEXT");
  }
  if (!followUpNames.has("delivery_status")) {
    db.exec("ALTER TABLE follow_ups ADD COLUMN delivery_status TEXT");
  }
  if (!followUpNames.has("delivered_at")) {
    db.exec("ALTER TABLE follow_ups ADD COLUMN delivered_at TEXT");
  }
  if (!followUpNames.has("failed_at")) {
    db.exec("ALTER TABLE follow_ups ADD COLUMN failed_at TEXT");
  }
  if (!followUpNames.has("provider_error_code")) {
    db.exec("ALTER TABLE follow_ups ADD COLUMN provider_error_code TEXT");
  }
  if (!followUpNames.has("provider_error_message")) {
    db.exec("ALTER TABLE follow_ups ADD COLUMN provider_error_message TEXT");
  }
  if (!followUpNames.has("dead_lettered_at")) {
    db.exec("ALTER TABLE follow_ups ADD COLUMN dead_lettered_at TEXT");
  }

  db.exec(
    `CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      window_start_ms INTEGER NOT NULL,
      count INTEGER NOT NULL
    )`
  );

  db.exec(
    `CREATE TABLE IF NOT EXISTS follow_up_dead_letters (
      id TEXT PRIMARY KEY,
      follow_up_id TEXT NOT NULL REFERENCES follow_ups(id),
      patient_id TEXT NOT NULL REFERENCES patients(id),
      doctor_id TEXT NOT NULL REFERENCES doctors(id),
      reason TEXT NOT NULL,
      last_error TEXT,
      retry_count INTEGER NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  );

  db.exec(
    `CREATE TABLE IF NOT EXISTS follow_up_provider_events (
      id TEXT PRIMARY KEY,
      follow_up_id TEXT NOT NULL REFERENCES follow_ups(id),
      provider_message_id TEXT NOT NULL,
      provider_status TEXT NOT NULL,
      error_code_norm TEXT NOT NULL DEFAULT '',
      error_message_norm TEXT NOT NULL DEFAULT '',
      payload TEXT NOT NULL,
      received_at TEXT NOT NULL,
      UNIQUE (provider_message_id, provider_status, error_code_norm, error_message_norm)
    )`
  );
}
