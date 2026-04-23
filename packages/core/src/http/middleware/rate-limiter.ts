import { Request, Response, NextFunction } from "express";
import { getDb } from "../../db/client.js";
import { getConfig } from "../../config.js";
import { appError } from "../../errors.js";
import { sendJson } from "../../utils.js";

const rateWindow = new Map<string, { count: number; resetAt: number }>();

export function resetRateLimiter(): void {
  rateWindow.clear();
}

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) {
    return next();
  }
  const key = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const db = getDb();
  const { apiRateLimitWindowMs, apiRateLimitMax } = getConfig();

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
    return next();
  }

  if (currentCount >= apiRateLimitMax && now < currentResetAt) {
    sendJson(res, 429, appError("RATE_LIMITED", "Too many requests"));
    return;
  }

  const nextCount = currentCount + 1;
  rateWindow.set(key, { count: nextCount, resetAt: currentResetAt });
  db.prepare("UPDATE rate_limits SET count = ? WHERE key = ?").run(nextCount, key);
  next();
}
