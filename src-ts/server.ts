import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { runMigrations } from "./db/migrations.js";
import { createIntent } from "./engine/intent.js";
import { executeIntent } from "./engine/executor.js";
import { appError, toStructuredError } from "./errors.js";
import { getConfig } from "./config.js";
import { createCapabilityHandlers, createRuntimeDeps, RuntimeDeps } from "./runtime.js";
import { listReplay, getReplayById, pruneReplayOlderThan } from "./engine/replay.js";
import { CapabilityName, RiskLevel } from "./types.js";
import { getPriorAuthById, listPriorAuths } from "./capabilities/prior-auth.js";
import { listFollowUps } from "./patients/store.js";
import { logger } from "./logger.js";
import { getOpsMetrics } from "./ops/metrics.js";
import { getFollowUpQueueStats } from "./capabilities/follow-up.js";
import { getDb } from "./db/client.js";

function sendJson(res: Response, status: number, payload: unknown): void {
  res.status(status).json(payload);
}

function requireScope(req: Request, res: Response, required: "read" | "write" | "admin"): boolean {
  const tokenScope = String(req.headers["x-token-scope"] ?? "admin");
  const rank: Record<"read" | "write" | "admin", number> = {
    read: 1,
    write: 2,
    admin: 3
  };
  if ((rank[tokenScope as keyof typeof rank] ?? 0) < rank[required]) {
    sendJson(res, 403, appError("FORBIDDEN", `Requires scope '${required}'`));
    return false;
  }
  return true;
}

function riskForRequest(capability: CapabilityName, body: Record<string, unknown>): RiskLevel {
  if (capability === "prior_auth" && body.submit === true) return "HIGH";
  if (capability === "follow_up" && body.sendNow === true) return "HIGH";
  return capability === "scribe" || capability === "decision_support" ? "LOW" : "MEDIUM";
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function requireString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function requireStringArray(body: Record<string, unknown>, field: string): string[] | null {
  const value = body[field];
  if (!Array.isArray(value)) return null;
  const cleaned = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return cleaned.length === value.length ? cleaned : null;
}

function validateCapabilityPayload(
  capability: CapabilityName,
  body: Record<string, unknown>
): { ok: true } | { ok: false; error: ReturnType<typeof appError> } {
  if (capability === "scribe") {
    if (!requireString(body, "transcript")) {
      return { ok: false, error: appError("VALIDATION_ERROR", "transcript is required") };
    }
    if (!requireString(body, "patientId")) {
      return { ok: false, error: appError("VALIDATION_ERROR", "patientId is required") };
    }
    if (!requireString(body, "doctorId")) {
      return { ok: false, error: appError("VALIDATION_ERROR", "doctorId is required") };
    }
    return { ok: true };
  }

  if (capability === "prior_auth") {
    if (!requireString(body, "patientId")) return { ok: false, error: appError("VALIDATION_ERROR", "patientId is required") };
    if (!requireString(body, "doctorId")) return { ok: false, error: appError("VALIDATION_ERROR", "doctorId is required") };
    if (!requireString(body, "procedureCode")) return { ok: false, error: appError("VALIDATION_ERROR", "procedureCode is required") };
    if (!requireString(body, "insurerId")) return { ok: false, error: appError("VALIDATION_ERROR", "insurerId is required") };
    if (!requireStringArray(body, "diagnosisCodes")) {
      return { ok: false, error: appError("VALIDATION_ERROR", "diagnosisCodes must be a string[]") };
    }
    return { ok: true };
  }

  if (capability === "follow_up") {
    if (!requireString(body, "patientId")) return { ok: false, error: appError("VALIDATION_ERROR", "patientId is required") };
    if (!requireString(body, "doctorId")) return { ok: false, error: appError("VALIDATION_ERROR", "doctorId is required") };
    const trigger = requireString(body, "trigger");
    if (!trigger) return { ok: false, error: appError("VALIDATION_ERROR", "trigger is required") };
    if (!["post_visit", "lab_result", "medication_reminder", "custom"].includes(trigger)) {
      return { ok: false, error: appError("VALIDATION_ERROR", "trigger must be one of post_visit|lab_result|medication_reminder|custom") };
    }
    const channel = body.channel;
    if (channel !== undefined && channel !== "sms" && channel !== "whatsapp") {
      return { ok: false, error: appError("VALIDATION_ERROR", "channel must be sms or whatsapp") };
    }
    return { ok: true };
  }

  if (capability === "decision_support") {
    if (!requireString(body, "query")) return { ok: false, error: appError("VALIDATION_ERROR", "query is required") };
    return { ok: true };
  }

  return { ok: true };
}

async function handleCapability(
  req: Request,
  res: Response,
  capability: CapabilityName,
  deps: RuntimeDeps
): Promise<void> {
  try {
    const body = asObject(req.body);
    if (!body) {
      sendJson(res, 400, appError("VALIDATION_ERROR", "Request body must be a JSON object"));
      return;
    }
    const validation = validateCapabilityPayload(capability, body);
    if (!validation.ok) {
      sendJson(res, 422, validation.error);
      return;
    }

    const intent = createIntent({
      capability,
      doctorId: String(body.doctorId ?? "d_api"),
      patientId: body.patientId ? String(body.patientId) : undefined,
      payload: body,
      risk: riskForRequest(capability, body),
      dryRun: Boolean(body.dryRun)
    });

    const result = await executeIntent(intent, createCapabilityHandlers(deps), {
      confirm: Boolean(body.confirm),
      requestId: String(req.headers["x-request-id"] ?? ""),
      actorId: String(req.headers["x-actor-id"] ?? "system")
    });

    if (result.ok === false) {
      sendJson(res, result.blocked ? 409 : 400, result);
      return;
    }

    sendJson(res, 200, { ok: true, data: result.output });
  } catch (error) {
    sendJson(res, 500, toStructuredError(error));
  }
}

export function createServer(deps: RuntimeDeps = createRuntimeDeps()) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  const { apiToken, apiRateLimitWindowMs, apiRateLimitMax } = getConfig();
  const rateWindow = new Map<string, { count: number; resetAt: number }>();

  app.use((req, res, next) => {
    const startedAt = Date.now();
    const requestId = req.header("x-request-id") ?? randomUUID();
    const actorId = req.header("x-actor-id") ?? "system";
    req.headers["x-request-id"] = requestId;
    req.headers["x-actor-id"] = actorId;
    res.setHeader("x-request-id", requestId);
    logger.info("request.received", { requestId, actorId, method: req.method, path: req.path });
    res.on("finish", () => {
      logger.info("request.completed", {
        requestId,
        actorId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt
      });
    });
    next();
  });

  app.use((req, res, next) => {
    if (!apiToken || !req.path.startsWith("/api")) {
      next();
      return;
    }
    const auth = req.header("authorization");
    const expected = `Bearer ${apiToken}`;
    if (auth !== expected) {
      sendJson(res, 401, appError("UNAUTHORIZED", "Missing or invalid API token"));
      return;
    }
    next();
  });

  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) {
      next();
      return;
    }
    const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const db = getDb();
    const dbBucket = db
      .prepare("SELECT key, window_start_ms, count FROM rate_limits WHERE key = ?")
      .get(key) as { key: string; window_start_ms: number; count: number } | undefined;
    const memoryBucket = rateWindow.get(key);
    const currentCount = dbBucket?.count ?? memoryBucket?.count ?? 0;
    const currentWindowStart =
      dbBucket?.window_start_ms ?? (memoryBucket ? memoryBucket.resetAt - apiRateLimitWindowMs : 0);
    const currentResetAt = currentWindowStart + apiRateLimitWindowMs;

    if (currentCount === 0 || now >= currentResetAt) {
      const resetAt = now + apiRateLimitWindowMs;
      rateWindow.set(key, { count: 1, resetAt });
      db.prepare(
        `INSERT INTO rate_limits (key, window_start_ms, count)
         VALUES (?, ?, 1)
         ON CONFLICT(key) DO UPDATE SET window_start_ms = excluded.window_start_ms, count = 1`
      ).run(key, now);
      next();
      return;
    }
    if (currentCount >= apiRateLimitMax && now < currentResetAt) {
      sendJson(res, 429, appError("RATE_LIMITED", "Too many requests"));
      return;
    }
    const nextCount = currentCount + 1;
    rateWindow.set(key, { count: nextCount, resetAt: currentResetAt });
    db.prepare("UPDATE rate_limits SET count = ? WHERE key = ?").run(nextCount, key);
    next();
  });

  app.get("/health", (_req, res) => {
    sendJson(res, 200, { ok: true, data: { status: "ok" } });
  });
  app.get("/health/ready", (_req, res) => {
    try {
      const metrics = getOpsMetrics();
      sendJson(res, 200, {
        ok: true,
        data: {
          status: "ready",
          metrics,
          queue: getFollowUpQueueStats()
        }
      });
    } catch (error) {
      sendJson(res, 503, appError("NOT_READY", error instanceof Error ? error.message : "not ready"));
    }
  });

  app.post("/api/scribe", async (req, res) => handleCapability(req, res, "scribe", deps));
  app.post("/api/prior-auth", async (req, res) => handleCapability(req, res, "prior_auth", deps));
  app.post("/api/follow-up", async (req, res) => handleCapability(req, res, "follow_up", deps));
  app.post("/api/decide", async (req, res) => handleCapability(req, res, "decision_support", deps));
  app.patch("/api/prior-auth/:id/status", async (req, res) => {
    const body = asObject(req.body);
    if (!body) {
      sendJson(res, 400, appError("VALIDATION_ERROR", "Request body must be a JSON object"));
      return;
    }
    const status = requireString(body, "status");
    if (!status) {
      sendJson(res, 422, appError("VALIDATION_ERROR", "status is required"));
      return;
    }
    const intent = createIntent({
      capability: "prior_auth",
      doctorId: String(body.doctorId ?? "d_api"),
      payload: {
        mode: "status_update",
        priorAuthId: req.params.id,
        status
      },
      risk: "HIGH",
      dryRun: false
    });
    const result = await executeIntent(intent, createCapabilityHandlers(deps), {
      confirm: Boolean(body.confirm),
      requestId: String(req.headers["x-request-id"] ?? ""),
      actorId: String(req.headers["x-actor-id"] ?? "system")
    });
    if (result.ok === false) {
      sendJson(res, result.blocked ? 409 : 400, result);
      return;
    }
    sendJson(res, 200, { ok: true, data: result.output });
  });

  app.get("/api/prior-auth", (req, res) => {
    if (!requireScope(req, res, "read")) return;
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    sendJson(res, 200, { ok: true, data: listPriorAuths(patientId) });
  });

  app.get("/api/prior-auth/:id", (req, res) => {
    if (!requireScope(req, res, "read")) return;
    const row = getPriorAuthById(req.params.id);
    if (!row) {
      sendJson(res, 404, appError("NOT_FOUND", "Prior auth not found"));
      return;
    }
    sendJson(res, 200, { ok: true, data: row });
  });

  app.get("/api/follow-up", (req, res) => {
    if (!requireScope(req, res, "read")) return;
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const validStatus = status === "scheduled" || status === "sent" || status === "failed" ? status : undefined;
    sendJson(res, 200, { ok: true, data: listFollowUps({ patientId, status: validStatus }) });
  });
  app.post("/api/follow-up/:id/retry", async (req, res) => {
    const body = asObject(req.body) ?? {};
    const intent = createIntent({
      capability: "follow_up",
      doctorId: String(body.doctorId ?? "d_api"),
      payload: {
        mode: "retry_failed",
        followUpId: req.params.id
      },
      risk: "HIGH",
      dryRun: Boolean(body.dryRun)
    });
    const result = await executeIntent(intent, createCapabilityHandlers(deps), {
      confirm: Boolean(body.confirm),
      requestId: String(req.headers["x-request-id"] ?? ""),
      actorId: String(req.headers["x-actor-id"] ?? "system")
    });
    if (result.ok === false) {
      sendJson(res, result.blocked ? 409 : 400, result);
      return;
    }
    sendJson(res, 200, { ok: true, data: result.output });
  });
  app.post("/api/follow-up/dispatch", async (req, res) => {
    const body = asObject(req.body) ?? {};
    const limit = Number(body.limit ?? 50);
    const intent = createIntent({
      capability: "follow_up",
      doctorId: String(body.doctorId ?? "d_api"),
      payload: { mode: "dispatch_due", limit },
      risk: "HIGH",
      dryRun: Boolean(body.dryRun)
    });
    const result = await executeIntent(intent, createCapabilityHandlers(deps), {
      confirm: Boolean(body.confirm),
      requestId: String(req.headers["x-request-id"] ?? ""),
      actorId: String(req.headers["x-actor-id"] ?? "system")
    });
    if (result.ok === false) {
      sendJson(res, result.blocked ? 409 : 400, result);
      return;
    }
    sendJson(res, 200, { ok: true, data: result.output });
  });
  app.post("/api/follow-up/retry-failed-bulk", async (req, res) => {
    const body = asObject(req.body) ?? {};
    const limit = Number(body.limit ?? 25);
    const intent = createIntent({
      capability: "follow_up",
      doctorId: String(body.doctorId ?? "d_api"),
      payload: { mode: "retry_failed_bulk", limit },
      risk: "HIGH",
      dryRun: Boolean(body.dryRun)
    });
    const result = await executeIntent(intent, createCapabilityHandlers(deps), {
      confirm: Boolean(body.confirm),
      requestId: String(req.headers["x-request-id"] ?? ""),
      actorId: String(req.headers["x-actor-id"] ?? "system")
    });
    if (result.ok === false) {
      sendJson(res, result.blocked ? 409 : 400, result);
      return;
    }
    sendJson(res, 200, { ok: true, data: result.output });
  });

  app.get("/api/replay", (_req, res) => {
    if (!requireScope(_req, res, "read")) return;
    sendJson(res, 200, { ok: true, data: listReplay() });
  });
  app.post("/api/replay/prune", (req, res) => {
    if (!requireScope(req, res, "admin")) return;
    const body = asObject(req.body) ?? {};
    const days = Number(body.days ?? 30);
    if (!Number.isFinite(days) || days <= 0) {
      sendJson(res, 422, appError("VALIDATION_ERROR", "days must be a positive number"));
      return;
    }
    if (!Boolean(body.confirm)) {
      sendJson(
        res,
        409,
        appError("RISK_CONFIRMATION_REQUIRED", "Replay pruning requires confirm=true", {
          requiredConfirmation: true
        })
      );
      return;
    }
    const deleted = pruneReplayOlderThan(days);
    sendJson(res, 200, { ok: true, data: { deleted, days } });
  });

  app.get("/api/replay/:id", (req, res) => {
    if (!requireScope(req, res, "read")) return;
    const row = getReplayById(req.params.id);
    if (!row) {
      sendJson(res, 404, appError("NOT_FOUND", "Replay row not found"));
      return;
    }
    sendJson(res, 200, { ok: true, data: row });
  });
  app.get("/api/ops/metrics", (_req, res) => {
    if (!requireScope(_req, res, "admin")) return;
    sendJson(res, 200, {
      ok: true,
      data: {
        ...getOpsMetrics(),
        queue: getFollowUpQueueStats()
      }
    });
  });

  return app;
}

export function startServer(port?: number): void {
  runMigrations();
  const cfg = getConfig();
  const deps = createRuntimeDeps();
  const app = createServer(deps);
  const listenPort = port ?? cfg.port;

  app.listen(listenPort, () => {
    console.log(JSON.stringify({ ok: true, message: `doctor-agent listening on ${listenPort}` }));
  });

  setInterval(() => {
    const dispatchIntent = createIntent({
      capability: "follow_up",
      doctorId: "system",
      payload: { mode: "dispatch_due", limit: 50 },
      risk: "MEDIUM",
      dryRun: cfg.dryRun
    });
    void executeIntent(dispatchIntent, createCapabilityHandlers(deps), {
      confirm: true,
      requestId: `system-dispatch-${Date.now()}`,
      actorId: "system-dispatcher"
    }).catch((error: unknown) => {
      logger.error("follow-up.dispatch.tick_failed", {
        message: error instanceof Error ? error.message : String(error)
      });
    });
  }, 60_000);

  setInterval(() => {
    try {
      const deleted = pruneReplayOlderThan(cfg.replayRetentionDays);
      if (deleted > 0) {
        logger.info("replay.retention.pruned", {
          deleted,
          retentionDays: cfg.replayRetentionDays
        });
      }
    } catch (error) {
      logger.error("replay.retention.failed", {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }, cfg.replayRetentionIntervalMs);
}
