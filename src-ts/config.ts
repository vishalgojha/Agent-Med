import dotenv from "dotenv";

export interface Config {
  anthropicApiKey: string;
  aiModel: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  apiToken: string;
  apiRateLimitWindowMs: number;
  apiRateLimitMax: number;
  replayRetentionDays: number;
  replayRetentionIntervalMs: number;
  port: number;
  nodeEnv: string;
  dbPath: string;
  dryRun: boolean;
}

let cachedConfig: Config | null = null;

export function readConfig(): Config {
  dotenv.config({ quiet: true });

  const cfg: Config = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    aiModel: process.env.AI_MODEL ?? "claude-sonnet-4-5",
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
    apiToken: process.env.API_TOKEN ?? "",
    apiRateLimitWindowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS ?? 60000),
    apiRateLimitMax: Number(process.env.API_RATE_LIMIT_MAX ?? 120),
    replayRetentionDays: Number(process.env.REPLAY_RETENTION_DAYS ?? 30),
    replayRetentionIntervalMs: Number(process.env.REPLAY_RETENTION_INTERVAL_MS ?? 3600000),
    port: Number(process.env.PORT ?? 3001),
    nodeEnv: process.env.NODE_ENV ?? "development",
    dbPath: process.env.DB_PATH ?? "./data/doctor-agent.db",
    dryRun: String(process.env.DRY_RUN ?? "false").toLowerCase() === "true"
  };

  if (!Number.isFinite(cfg.port) || cfg.port <= 0) {
    throw new Error("PORT must be a positive number");
  }
  if (!Number.isFinite(cfg.apiRateLimitWindowMs) || cfg.apiRateLimitWindowMs <= 0) {
    throw new Error("API_RATE_LIMIT_WINDOW_MS must be a positive number");
  }
  if (!Number.isFinite(cfg.apiRateLimitMax) || cfg.apiRateLimitMax <= 0) {
    throw new Error("API_RATE_LIMIT_MAX must be a positive number");
  }
  if (!Number.isFinite(cfg.replayRetentionDays) || cfg.replayRetentionDays <= 0) {
    throw new Error("REPLAY_RETENTION_DAYS must be a positive number");
  }
  if (!Number.isFinite(cfg.replayRetentionIntervalMs) || cfg.replayRetentionIntervalMs <= 0) {
    throw new Error("REPLAY_RETENTION_INTERVAL_MS must be a positive number");
  }

  return cfg;
}

export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = readConfig();
  }
  return cachedConfig;
}

export function resetConfigForTests(): void {
  cachedConfig = null;
}
