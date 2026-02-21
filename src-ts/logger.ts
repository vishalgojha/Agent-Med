import { nowIso } from "./utils.js";

const REDACT_KEYS = new Set([
  "name",
  "patientName",
  "dob",
  "phone",
  "to",
  "patient_phone",
  "patient_name"
]);

export function redact<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redact(item)) as T;
  }

  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (REDACT_KEYS.has(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v);
      }
    }
    return out as T;
  }

  return input;
}

function log(level: "info" | "warn" | "error", message: string, data?: unknown): void {
  const payload = {
    ts: nowIso(),
    level,
    message,
    data: data === undefined ? undefined : redact(data)
  };
  const writer = level === "error" ? console.error : console.log;
  writer(JSON.stringify(payload));
}

export const logger = {
  info: (message: string, data?: unknown): void => log("info", message, data),
  warn: (message: string, data?: unknown): void => log("warn", message, data),
  error: (message: string, data?: unknown): void => log("error", message, data)
};
