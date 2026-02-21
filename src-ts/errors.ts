import { StructuredError } from "./types.js";

export function appError(code: string, message: string, details?: unknown): StructuredError {
  return { ok: false, code, message, details };
}

export function toStructuredError(error: unknown, fallbackCode = "INTERNAL_ERROR"): StructuredError {
  if (typeof error === "object" && error !== null && "ok" in error && (error as { ok: unknown }).ok === false) {
    return error as StructuredError;
  }

  if (error instanceof Error) {
    return appError(fallbackCode, error.message);
  }

  return appError(fallbackCode, "Unknown error", { error: String(error) });
}
