import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getConfig } from "../config.js";
import { logger } from "../logger.js";
import { markFollowUpSentWithProvider } from "../patients/store.js";
import { nowIso } from "../utils.js";
import { MessagingAdapter } from "./interface.js";

const QUEUE_SUFFIX = ".delivery-queue";
const FAILED_DIRNAME = "failed";
const MAX_RETRIES = 5;
const BACKOFF_MS: readonly number[] = [5_000, 25_000, 120_000, 600_000];
const SAFE_QUEUE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export type DeliveryQueueSnapshot = {
  queued: number;
  failed: number;
  oldestPendingAt: string | null;
  oldestPendingAgeMs: number | null;
  error: string | null;
};

export type QueuedDelivery = {
  id: string;
  followUpId: string;
  to: string;
  body: string;
  channel: "sms" | "whatsapp";
  enqueuedAt: number;
  retryCount: number;
  lastError?: string;
};

export type FailedDeliveryRetryResult =
  | {
      status: "sent";
      entry: QueuedDelivery;
      providerMessageId: string;
    }
  | {
      status: "failed";
      entry: QueuedDelivery;
      error: string;
    };

type EnqueueDeliveryInput = {
  followUpId: string;
  to: string;
  body: string;
  channel: "sms" | "whatsapp";
};

function resolveQueueDirFromDbPath(dbPath: string): string {
  return `${path.resolve(dbPath)}${QUEUE_SUFFIX}`;
}

function resolveQueueDir(): string {
  return resolveQueueDirFromDbPath(getConfig().dbPath);
}

function resolveFailedDir(queueDir: string): string {
  return path.join(queueDir, FAILED_DIRNAME);
}

function normalizeQueueId(followUpId: string): string {
  const cleaned = followUpId.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return cleaned.length > 0 ? cleaned : `fu_${randomUUID()}`;
}

function safeQueueId(rawId: string): string {
  const id = rawId.trim();
  if (!id || !SAFE_QUEUE_ID_PATTERN.test(id)) {
    throw new Error("invalid delivery queue id");
  }
  return id;
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(payload, null, 2), { encoding: "utf-8" });
  await fs.promises.rename(tmp, filePath);
}

async function safeReadJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function resolveDeliveryQueuePathForDbPath(dbPath: string): string {
  return resolveQueueDirFromDbPath(dbPath);
}

export function resolveDeliveryQueuePath(): string {
  return resolveQueueDir();
}

export function getDeliveryQueueSnapshotSync(nowMs = Date.now()): DeliveryQueueSnapshot {
  const queueDir = resolveQueueDir();
  const failedDir = resolveFailedDir(queueDir);
  let queued = 0;
  let failed = 0;
  let oldestPendingMs: number | null = null;

  try {
    const entries = fs.readdirSync(queueDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      queued += 1;
      const filePath = path.join(queueDir, entry.name);
      let enqueuedAtMs: number | null = null;
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<QueuedDelivery>;
        if (typeof parsed.enqueuedAt === "number" && Number.isFinite(parsed.enqueuedAt)) {
          enqueuedAtMs = parsed.enqueuedAt;
        }
      } catch {
        // Ignore malformed queue payloads and use mtime fallback.
      }
      if (enqueuedAtMs === null) {
        try {
          enqueuedAtMs = fs.statSync(filePath).mtimeMs;
        } catch {
          enqueuedAtMs = nowMs;
        }
      }
      oldestPendingMs =
        oldestPendingMs === null ? enqueuedAtMs : Math.min(oldestPendingMs, enqueuedAtMs);
    }
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code !== "ENOENT") {
      return {
        queued: 0,
        failed: 0,
        oldestPendingAt: null,
        oldestPendingAgeMs: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  try {
    const failedEntries = fs.readdirSync(failedDir, { withFileTypes: true });
    failed = failedEntries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).length;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code !== "ENOENT") {
      return {
        queued,
        failed: 0,
        oldestPendingAt: oldestPendingMs === null ? null : new Date(oldestPendingMs).toISOString(),
        oldestPendingAgeMs: oldestPendingMs === null ? null : Math.max(0, nowMs - oldestPendingMs),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  return {
    queued,
    failed,
    oldestPendingAt: oldestPendingMs === null ? null : new Date(oldestPendingMs).toISOString(),
    oldestPendingAgeMs: oldestPendingMs === null ? null : Math.max(0, nowMs - oldestPendingMs),
    error: null
  };
}

export function computeDeliveryBackoffMs(retryCount: number): number {
  if (retryCount <= 0) {
    return 0;
  }
  return BACKOFF_MS[Math.min(retryCount - 1, BACKOFF_MS.length - 1)] ?? BACKOFF_MS.at(-1) ?? 0;
}

export async function ensureDeliveryQueueDir(): Promise<string> {
  const queueDir = resolveQueueDir();
  await fs.promises.mkdir(queueDir, { recursive: true });
  await fs.promises.mkdir(resolveFailedDir(queueDir), { recursive: true });
  return queueDir;
}

function resolveQueuedFilePath(id: string): string {
  return path.join(resolveQueueDir(), `${safeQueueId(id)}.json`);
}

function resolveFailedFilePath(id: string): string {
  const queueDir = resolveQueueDir();
  return path.join(resolveFailedDir(queueDir), `${safeQueueId(id)}.json`);
}

export async function enqueueDelivery(input: EnqueueDeliveryInput): Promise<string> {
  const queueId = normalizeQueueId(input.followUpId);
  await ensureDeliveryQueueDir();
  const filePath = resolveQueuedFilePath(queueId);
  const existing = await safeReadJson<QueuedDelivery>(filePath);
  if (existing) {
    return queueId;
  }
  const entry: QueuedDelivery = {
    id: queueId,
    followUpId: input.followUpId,
    to: input.to,
    body: input.body,
    channel: input.channel,
    enqueuedAt: Date.now(),
    retryCount: 0
  };
  await writeJsonAtomic(filePath, entry);
  return queueId;
}

export async function ackDelivery(queueId: string): Promise<void> {
  const filePath = resolveQueuedFilePath(queueId);
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

export async function failDelivery(queueId: string, errorMessage: string): Promise<void> {
  const filePath = resolveQueuedFilePath(queueId);
  const entry = await safeReadJson<QueuedDelivery>(filePath);
  if (!entry) {
    return;
  }
  entry.retryCount += 1;
  entry.lastError = errorMessage.slice(0, 1000);
  await writeJsonAtomic(filePath, entry);
}

async function moveToFailed(queueId: string): Promise<void> {
  const queueDir = resolveQueueDir();
  const failedDir = resolveFailedDir(queueDir);
  await fs.promises.mkdir(failedDir, { recursive: true });
  const id = safeQueueId(queueId);
  const src = resolveQueuedFilePath(id);
  const dest = path.join(failedDir, `${id}.json`);
  await fs.promises.rename(src, dest);
}

async function listDeliveriesInDir(dirPath: string): Promise<QueuedDelivery[]> {
  let files: string[] = [];
  try {
    files = await fs.promises.readdir(dirPath);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const entries: QueuedDelivery[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const entry = await safeReadJson<QueuedDelivery>(path.join(dirPath, file));
    if (!entry) {
      continue;
    }
    entries.push(entry);
  }
  return entries.slice().sort((a, b) => a.enqueuedAt - b.enqueuedAt);
}

export async function listQueuedDeliveries(): Promise<QueuedDelivery[]> {
  return await listDeliveriesInDir(resolveQueueDir());
}

export async function listPendingDeliveries(limit = 50): Promise<QueuedDelivery[]> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 50;
  const entries = await listQueuedDeliveries();
  return entries.slice(0, safeLimit);
}

export async function getPendingDeliveryById(queueId: string): Promise<QueuedDelivery | null> {
  return await safeReadJson<QueuedDelivery>(resolveQueuedFilePath(queueId));
}

function normalizePendingQueueIds(queueIds: string[]): string[] {
  return Array.from(new Set(queueIds.map((queueId) => safeQueueId(queueId))));
}

export async function inspectPendingDeliveriesByIds(queueIds: string[]): Promise<{
  entries: QueuedDelivery[];
  missingIds: string[];
}> {
  const ids = normalizePendingQueueIds(queueIds);
  const entries: QueuedDelivery[] = [];
  const missingIds: string[] = [];
  for (const id of ids) {
    const entry = await getPendingDeliveryById(id);
    if (!entry) {
      missingIds.push(id);
      continue;
    }
    entries.push(entry);
  }
  return { entries, missingIds };
}

export async function removePendingDeliveryById(queueId: string): Promise<QueuedDelivery> {
  const entry = await getPendingDeliveryById(queueId);
  if (!entry) {
    throw new Error("Pending delivery not found");
  }
  try {
    await fs.promises.unlink(resolveQueuedFilePath(queueId));
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ENOENT") {
      throw new Error("Pending delivery not found");
    }
    throw error;
  }
  return entry;
}

export async function removePendingDeliveriesByIds(queueIds: string[]): Promise<{
  cancelled: QueuedDelivery[];
  missingIds: string[];
}> {
  const ids = normalizePendingQueueIds(queueIds);
  const cancelled: QueuedDelivery[] = [];
  const missingIds: string[] = [];
  for (const id of ids) {
    try {
      const entry = await removePendingDeliveryById(id);
      cancelled.push(entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "Pending delivery not found") {
        missingIds.push(id);
        continue;
      }
      throw error;
    }
  }
  return { cancelled, missingIds };
}

export async function listFailedDeliveries(limit = 50): Promise<QueuedDelivery[]> {
  const queueDir = resolveQueueDir();
  const failedDir = resolveFailedDir(queueDir);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 50;
  const entries = await listDeliveriesInDir(failedDir);
  return entries.slice().reverse().slice(0, safeLimit);
}

export async function getFailedDeliveryById(queueId: string): Promise<QueuedDelivery | null> {
  return await safeReadJson<QueuedDelivery>(resolveFailedFilePath(queueId));
}

export async function requeueFailedDelivery(params: {
  queueId: string;
  resetRetryCount?: boolean;
}): Promise<QueuedDelivery> {
  const entry = await getFailedDeliveryById(params.queueId);
  if (!entry) {
    throw new Error("Failed delivery not found");
  }
  const nextEntry: QueuedDelivery = {
    ...entry,
    retryCount: params.resetRetryCount ? 0 : entry.retryCount,
    lastError: params.resetRetryCount ? undefined : entry.lastError
  };
  await writeJsonAtomic(resolveQueuedFilePath(params.queueId), nextEntry);
  await fs.promises.unlink(resolveFailedFilePath(params.queueId));
  return nextEntry;
}

export async function retryFailedDeliveryNow(params: {
  queueId: string;
  messaging: MessagingAdapter;
}): Promise<FailedDeliveryRetryResult> {
  const entry = await getFailedDeliveryById(params.queueId);
  if (!entry) {
    throw new Error("Failed delivery not found");
  }

  try {
    const sendResult = await params.messaging.send({
      to: entry.to,
      body: entry.body,
      channel: entry.channel
    });
    markFollowUpSentWithProvider(entry.followUpId, nowIso(), sendResult.id);
    await fs.promises.unlink(resolveFailedFilePath(params.queueId));
    return {
      status: "sent",
      entry,
      providerMessageId: sendResult.id
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedEntry: QueuedDelivery = {
      ...entry,
      retryCount: entry.retryCount + 1,
      lastError: message.slice(0, 1000)
    };
    await writeJsonAtomic(resolveFailedFilePath(params.queueId), failedEntry);
    return {
      status: "failed",
      entry: failedEntry,
      error: message
    };
  }
}

function isLikelyPermanentDeliveryError(errorMessage: string): boolean {
  return (
    /invalid phone number/i.test(errorMessage) ||
    /unsubscribed/i.test(errorMessage) ||
    /cannot route/i.test(errorMessage) ||
    /unknown destination/i.test(errorMessage)
  );
}

export async function recoverPendingDeliveries(params: {
  messaging: MessagingAdapter;
  dryRun: boolean;
  maxRecoveryMs?: number;
  delay?: (ms: number) => Promise<void>;
}): Promise<{ recovered: number; failed: number; skipped: number }> {
  if (params.dryRun) {
    return { recovered: 0, failed: 0, skipped: 0 };
  }
  const pending = await listQueuedDeliveries();
  if (pending.length === 0) {
    return { recovered: 0, failed: 0, skipped: 0 };
  }

  const deadline = Date.now() + (params.maxRecoveryMs ?? 30_000);
  const delay = params.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let recovered = 0;
  let failed = 0;
  let skipped = 0;

  for (const entry of pending) {
    if (Date.now() >= deadline) {
      break;
    }
    if (entry.retryCount >= MAX_RETRIES) {
      try {
        await moveToFailed(entry.id);
      } catch (error) {
        logger.error("delivery_queue.move_failed", {
          queueId: entry.id,
          followUpId: entry.followUpId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      skipped += 1;
      continue;
    }

    const backoffMs = computeDeliveryBackoffMs(entry.retryCount + 1);
    if (backoffMs > 0) {
      if (Date.now() + backoffMs >= deadline) {
        break;
      }
      await delay(backoffMs);
    }

    try {
      const sendResult = await params.messaging.send({
        to: entry.to,
        body: entry.body,
        channel: entry.channel
      });
      markFollowUpSentWithProvider(entry.followUpId, nowIso(), sendResult.id);
      await ackDelivery(entry.id);
      recovered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isLikelyPermanentDeliveryError(message)) {
        try {
          await moveToFailed(entry.id);
        } catch (moveError) {
          logger.error("delivery_queue.move_failed", {
            queueId: entry.id,
            followUpId: entry.followUpId,
            message: moveError instanceof Error ? moveError.message : String(moveError)
          });
        }
      } else {
        await failDelivery(entry.id, message).catch(() => undefined);
      }
      failed += 1;
    }
  }

  return { recovered, failed, skipped };
}
