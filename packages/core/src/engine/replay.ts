import { getDb } from "../db/client.js";
import { ActionResult } from "../types.js";
import { makeId } from "../utils.js";

export function appendReplayLog(result: ActionResult): string {
  const db = getDb();
  const id = makeId("replay");

  db.prepare(
    `INSERT INTO replay_log
    (id, intent_id, capability, risk, ok, output, request_id, actor_id, executed_at, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    result.intentId,
    result.capability,
    result.risk,
    result.ok ? 1 : 0,
    JSON.stringify(result.output),
    result.requestId ?? null,
    result.actorId ?? null,
    result.executedAt,
    result.durationMs
  );

  return id;
}

export function listReplay(limit = 20): Array<Record<string, unknown>> {
  const db = getDb();
  return db
    .prepare("SELECT * FROM replay_log ORDER BY executed_at DESC LIMIT ?")
    .all(limit) as Array<Record<string, unknown>>;
}

export function getReplayById(id: string): Record<string, unknown> | null {
  const db = getDb();
  return (db.prepare("SELECT * FROM replay_log WHERE id = ?").get(id) as Record<string, unknown> | undefined) ?? null;
}

export function pruneReplayOlderThan(days: number): number {
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("days must be a positive number");
  }
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const db = getDb();
  const result = db.prepare("DELETE FROM replay_log WHERE executed_at < ?").run(cutoff);
  return result.changes;
}
