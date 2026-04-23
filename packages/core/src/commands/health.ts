import { getConfig } from "../config.js";
import { runMigrations } from "../db/migrations.js";
import { print } from "../utils.js";

export async function runHealth(): Promise<void> {
  const cfg = getConfig();
  runMigrations();

  const checks = {
    db: "ok",
    aiConfigured: Boolean(cfg.anthropicApiKey),
    twilioConfigured: Boolean(cfg.twilioAccountSid && cfg.twilioAuthToken && cfg.twilioFromNumber),
    dryRun: cfg.dryRun
  };

  print({ ok: true, data: checks });
}
