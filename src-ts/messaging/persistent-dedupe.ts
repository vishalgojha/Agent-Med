import fs from "node:fs";
import path from "node:path";
import { getConfig } from "../config.js";

type PersistentDedupeData = Record<string, number>;

export type PersistentDedupeOptions = {
  ttlMs: number;
  memoryMaxSize: number;
  fileMaxEntries: number;
  filePath: string;
};

export type PersistentDedupeCheckOptions = {
  now?: number;
};

export type PersistentDedupe = {
  checkAndRecord: (key: string, options?: PersistentDedupeCheckOptions) => Promise<boolean>;
  clearMemory: () => void;
  memorySize: () => number;
};

const WEBHOOK_DEDUPE_SUFFIX = ".twilio-webhook-dedupe.json";

function resolveDedupePathFromDbPath(dbPath: string): string {
  return `${path.resolve(dbPath)}${WEBHOOK_DEDUPE_SUFFIX}`;
}

export function resolveTwilioWebhookDedupePathForDbPath(dbPath: string): string {
  return resolveDedupePathFromDbPath(dbPath);
}

export function resolveTwilioWebhookDedupePath(): string {
  return resolveDedupePathFromDbPath(getConfig().dbPath);
}

function sanitizeData(value: unknown): PersistentDedupeData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: PersistentDedupeData = {};
  for (const [key, ts] of Object.entries(value as Record<string, unknown>)) {
    if (typeof ts === "number" && Number.isFinite(ts) && ts > 0) {
      out[key] = ts;
    }
  }
  return out;
}

function pruneData(data: PersistentDedupeData, now: number, ttlMs: number, maxEntries: number): void {
  for (const [key, ts] of Object.entries(data)) {
    if (now - ts >= ttlMs) {
      delete data[key];
    }
  }
  const keys = Object.keys(data);
  if (keys.length <= maxEntries) {
    return;
  }
  keys
    .slice()
    .sort((a, b) => data[a] - data[b])
    .slice(0, keys.length - maxEntries)
    .forEach((key) => {
      delete data[key];
    });
}

async function readData(filePath: string): Promise<PersistentDedupeData> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    return sanitizeData(JSON.parse(raw));
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeData(filePath: string, data: PersistentDedupeData): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(data), { encoding: "utf-8" });
  await fs.promises.rename(tmp, filePath);
}

function pruneMemory(memory: Map<string, number>, now: number, ttlMs: number, maxEntries: number): void {
  for (const [key, ts] of memory.entries()) {
    if (now - ts >= ttlMs) {
      memory.delete(key);
    }
  }
  if (memory.size <= maxEntries) {
    return;
  }
  const toDrop = Array.from(memory.entries())
    .slice()
    .sort((a, b) => a[1] - b[1])
    .slice(0, memory.size - maxEntries);
  for (const [key] of toDrop) {
    memory.delete(key);
  }
}

export function createPersistentDedupe(options: PersistentDedupeOptions): PersistentDedupe {
  const ttlMs = Math.max(1, Math.floor(options.ttlMs));
  const memoryMaxSize = Math.max(1, Math.floor(options.memoryMaxSize));
  const fileMaxEntries = Math.max(1, Math.floor(options.fileMaxEntries));
  const filePath = path.resolve(options.filePath);
  const memory = new Map<string, number>();
  let diskLoaded = false;
  let diskData: PersistentDedupeData = {};
  let lock = Promise.resolve();

  const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const previous = lock;
    let release: () => void = () => {};
    lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  };

  const ensureLoaded = async (): Promise<void> => {
    if (diskLoaded) {
      return;
    }
    diskData = await readData(filePath);
    diskLoaded = true;
  };

  const checkAndRecord = async (key: string, dedupeOptions?: PersistentDedupeCheckOptions): Promise<boolean> => {
    const normalized = key.trim();
    if (!normalized) {
      return true;
    }
    const now = dedupeOptions?.now ?? Date.now();

    const seenMemoryAt = memory.get(normalized);
    if (seenMemoryAt !== undefined && now - seenMemoryAt < ttlMs) {
      return false;
    }

    return await withLock(async () => {
      await ensureLoaded();
      pruneData(diskData, now, ttlMs, fileMaxEntries);

      const seenDiskAt = diskData[normalized];
      if (seenDiskAt !== undefined && now - seenDiskAt < ttlMs) {
        memory.set(normalized, seenDiskAt);
        pruneMemory(memory, now, ttlMs, memoryMaxSize);
        return false;
      }

      diskData[normalized] = now;
      pruneData(diskData, now, ttlMs, fileMaxEntries);
      await writeData(filePath, diskData);
      memory.set(normalized, now);
      pruneMemory(memory, now, ttlMs, memoryMaxSize);
      return true;
    });
  };

  return {
    checkAndRecord,
    clearMemory: () => memory.clear(),
    memorySize: () => memory.size
  };
}
