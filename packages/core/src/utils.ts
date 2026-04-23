import { randomUUID } from "node:crypto";
import { Specialty } from "../types.js";
import { Response } from "express";

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function print(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function sendJson(res: Response, status: number, payload: unknown): void {
  res.status(status).json(payload);
}

export function splitCsv(value?: string): string[] {
  if (!value) return [];
  return value.split(",").map((x) => x.trim()).filter(Boolean);
}

export function parseSpecialty(value: string): Specialty {
  const allowed: Specialty[] = [
    "primary_care",
    "emergency",
    "oncology",
    "psychiatry",
    "hospitalist",
    "surgery",
    "general"
  ];
  if (!allowed.includes(value as Specialty)) {
    throw new Error(`Invalid specialty '${value}'. Allowed: ${allowed.join(", ")}`);
  }
  return value as Specialty;
}

export function cliExecuteOptions(confirm?: boolean, actorId = "cli"): { confirm: boolean; requestId: string; actorId: string } {
  return {
    confirm: Boolean(confirm),
    requestId: `cli-${randomUUID()}`,
    actorId
  };
}

export function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function requireString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function requireStringArray(body: Record<string, unknown>, field: string): string[] | null {
  const value = body[field];
  if (!Array.isArray(value)) return null;
  const cleaned = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return cleaned.length === value.length ? cleaned : null;
}

export function twilioWebhookDedupeKey(body: Record<string, string>): string {
  return [
    body.MessageSid ?? "",
    body.MessageStatus ?? "",
    body.ErrorCode ?? "",
    body.ErrorMessage ?? ""
  ].join("|");
}
