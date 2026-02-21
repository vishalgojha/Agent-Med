import fs from "node:fs";
import path from "node:path";
import { closeDb } from "../db/client.js";
import { runMigrations } from "../db/migrations.js";
import { resetConfigForTests } from "../config.js";

export function setupTestDb(name: string): string {
  closeDb();
  const dbPath = path.resolve(`./data/${name}.db`);
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { force: true });
  }

  process.env.DB_PATH = dbPath;
  process.env.DRY_RUN = "true";
  resetConfigForTests();
  runMigrations();
  return dbPath;
}

export function teardownTestDb(dbPath: string): void {
  closeDb();
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { force: true });
  }
}
