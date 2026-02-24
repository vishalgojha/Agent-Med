import fs from "node:fs";
import path from "node:path";
import { closeDb } from "../db/client.js";
import { runMigrations } from "../db/migrations.js";
import { resetConfigForTests } from "../config.js";
import { resolveDeliveryQueuePathForDbPath } from "../messaging/delivery-queue.js";
import { resolveTwilioWebhookDedupePathForDbPath } from "../messaging/persistent-dedupe.js";

export function setupTestDb(name: string): string {
  closeDb();
  const dbPath = path.resolve(`./data/${name}.db`);
  const queueDir = resolveDeliveryQueuePathForDbPath(dbPath);
  const dedupePath = resolveTwilioWebhookDedupePathForDbPath(dbPath);
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { force: true });
  }
  if (fs.existsSync(queueDir)) {
    fs.rmSync(queueDir, { recursive: true, force: true });
  }
  if (fs.existsSync(dedupePath)) {
    fs.rmSync(dedupePath, { force: true });
  }

  process.env.DB_PATH = dbPath;
  process.env.DRY_RUN = "true";
  resetConfigForTests();
  runMigrations();
  return dbPath;
}

export function teardownTestDb(dbPath: string): void {
  closeDb();
  const queueDir = resolveDeliveryQueuePathForDbPath(dbPath);
  const dedupePath = resolveTwilioWebhookDedupePathForDbPath(dbPath);
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { force: true });
  }
  if (fs.existsSync(queueDir)) {
    fs.rmSync(queueDir, { recursive: true, force: true });
  }
  if (fs.existsSync(dedupePath)) {
    fs.rmSync(dedupePath, { force: true });
  }
}
