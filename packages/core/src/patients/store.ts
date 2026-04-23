import { getDb } from "../db/client.js";
import { makeId, nowIso, safeJsonParse } from "../utils.js";
import { FollowUpDeadLetterRecord, FollowUpRecord, Patient } from "./types.js";

interface PatientRow {
  id: string;
  doctor_id: string;
  name: string;
  dob: string | null;
  phone: string | null;
  meds: string | null;
  allergies: string | null;
  created_at: string;
}

interface FollowUpRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  trigger: string;
  body: string;
  channel: "sms" | "whatsapp";
  scheduled_at: string;
  sent_at: string | null;
  status: "scheduled" | "sent" | "failed" | "dead_letter";
  delivery_status?: "queued" | "sent" | "delivered" | "undelivered" | "failed" | null;
  retry_count?: number;
  last_error?: string | null;
  provider_message_id?: string | null;
  delivered_at?: string | null;
  failed_at?: string | null;
  provider_error_code?: string | null;
  provider_error_message?: string | null;
  dead_lettered_at?: string | null;
  created_at: string;
}

interface FollowUpDeadLetterRow {
  id: string;
  follow_up_id: string;
  patient_id: string;
  doctor_id: string;
  reason: string;
  last_error: string | null;
  retry_count: number;
  payload: string;
  created_at: string;
}

type ProviderDeliveryStatus = "queued" | "sent" | "delivered" | "undelivered" | "failed";

function mapPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    name: row.name,
    dob: row.dob ?? undefined,
    phone: row.phone ?? undefined,
    meds: safeJsonParse<string[]>(row.meds ?? "[]", []),
    allergies: safeJsonParse<string[]>(row.allergies ?? "[]", []),
    createdAt: row.created_at
  };
}

function mapFollowUp(row: FollowUpRow): FollowUpRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    trigger: row.trigger,
    body: row.body,
    channel: row.channel,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at ?? undefined,
    status: row.status,
    deliveryStatus: row.delivery_status ?? undefined,
    retryCount: row.retry_count ?? 0,
    lastError: row.last_error ?? undefined,
    providerMessageId: row.provider_message_id ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    failedAt: row.failed_at ?? undefined,
    providerErrorCode: row.provider_error_code ?? undefined,
    providerErrorMessage: row.provider_error_message ?? undefined,
    deadLetteredAt: row.dead_lettered_at ?? undefined,
    createdAt: row.created_at
  };
}

function mapFollowUpDeadLetter(row: FollowUpDeadLetterRow): FollowUpDeadLetterRecord {
  return {
    id: row.id,
    followUpId: row.follow_up_id,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    reason: row.reason,
    lastError: row.last_error ?? undefined,
    retryCount: row.retry_count,
    payload: row.payload,
    createdAt: row.created_at
  };
}

export function addPatient(input: {
  doctorId: string;
  name: string;
  dob?: string;
  phone?: string;
  meds?: string[];
  allergies?: string[];
  id?: string;
}): Patient {
  const db = getDb();
  const patient: Patient = {
    id: input.id ?? makeId("p"),
    doctorId: input.doctorId,
    name: input.name,
    dob: input.dob,
    phone: input.phone,
    meds: input.meds ?? [],
    allergies: input.allergies ?? [],
    createdAt: nowIso()
  };

  db.prepare(
    `INSERT INTO patients (id, doctor_id, name, dob, phone, meds, allergies, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    patient.id,
    patient.doctorId,
    patient.name,
    patient.dob ?? null,
    patient.phone ?? null,
    JSON.stringify(patient.meds),
    JSON.stringify(patient.allergies),
    patient.createdAt
  );

  return patient;
}

export function getPatientById(id: string): Patient | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM patients WHERE id = ?").get(id) as PatientRow | undefined;
  return row ? mapPatient(row) : null;
}

export function listPatients(): Patient[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM patients ORDER BY created_at DESC").all() as PatientRow[];
  return rows.map(mapPatient);
}

export function saveFollowUp(input: {
  patientId: string;
  doctorId: string;
  trigger: string;
  body: string;
  channel: "sms" | "whatsapp";
  scheduledAt: string;
}): FollowUpRecord {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM follow_ups
       WHERE patient_id = ? AND trigger = ? AND scheduled_at = ?`
    )
    .get(input.patientId, input.trigger, input.scheduledAt) as FollowUpRow | undefined;

  if (row) {
    return mapFollowUp(row);
  }

  const record: FollowUpRecord = {
    id: makeId("fu"),
    patientId: input.patientId,
    doctorId: input.doctorId,
    trigger: input.trigger,
    body: input.body,
    channel: input.channel,
    scheduledAt: input.scheduledAt,
    status: "scheduled",
    createdAt: nowIso()
  };

  db.prepare(
    `INSERT INTO follow_ups
     (id, patient_id, doctor_id, trigger, body, channel, scheduled_at, status, delivery_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.patientId,
    record.doctorId,
    record.trigger,
    record.body,
    record.channel,
    record.scheduledAt,
    record.status,
    "queued",
    record.createdAt
  );

  return record;
}

export function markFollowUpSent(id: string, status: "sent" | "failed", sentAt: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE follow_ups
     SET status = ?,
         sent_at = ?,
         delivery_status = ?,
         provider_error_code = NULL,
         provider_error_message = NULL
     WHERE id = ?`
  ).run(status, sentAt, status === "sent" ? "sent" : "failed", id);
}

export function markFollowUpSentWithProvider(
  id: string,
  sentAt: string,
  providerMessageId?: string
): void {
  const db = getDb();
  db.prepare(
    `UPDATE follow_ups
     SET status = 'sent',
         sent_at = ?,
         delivery_status = 'sent',
         provider_message_id = ?,
         last_error = NULL,
         provider_error_code = NULL,
         provider_error_message = NULL
     WHERE id = ?`
  ).run(sentAt, providerMessageId ?? null, id);
}

export function markFollowUpFailedWithBackoff(id: string, retryCount: number, errorMessage: string, nextScheduledAt: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE follow_ups
     SET status = 'scheduled',
         delivery_status = 'queued',
         retry_count = ?,
         last_error = ?,
         provider_message_id = NULL,
         scheduled_at = ?,
         sent_at = NULL
     WHERE id = ?`
  ).run(retryCount, errorMessage.slice(0, 500), nextScheduledAt, id);
}

export function moveFollowUpToDeadLetter(input: {
  followUpId: string;
  reason: string;
  lastError?: string;
  retryCount: number;
}): FollowUpDeadLetterRecord {
  const db = getDb();
  const row = db.prepare("SELECT * FROM follow_ups WHERE id = ?").get(input.followUpId) as FollowUpRow | undefined;
  if (!row) {
    throw new Error("Follow-up not found");
  }
  const createdAt = nowIso();
  const entry: FollowUpDeadLetterRecord = {
    id: makeId("fdl"),
    followUpId: row.id,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    reason: input.reason,
    lastError: input.lastError,
    retryCount: input.retryCount,
    payload: JSON.stringify(mapFollowUp(row)),
    createdAt
  };

  db.prepare(
    `INSERT INTO follow_up_dead_letters
     (id, follow_up_id, patient_id, doctor_id, reason, last_error, retry_count, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.id,
    entry.followUpId,
    entry.patientId,
    entry.doctorId,
    entry.reason,
    entry.lastError ?? null,
    entry.retryCount,
    entry.payload,
    entry.createdAt
  );

  db.prepare(
    `UPDATE follow_ups
     SET status = 'dead_letter',
         delivery_status = 'failed',
         last_error = ?,
         retry_count = ?,
         dead_lettered_at = ?,
         provider_message_id = NULL,
         sent_at = NULL
     WHERE id = ?`
  ).run(entry.lastError ?? null, entry.retryCount, createdAt, row.id);

  return entry;
}

export function updateFollowUpDeliveryByProviderMessageId(input: {
  providerMessageId: string;
  providerStatus: ProviderDeliveryStatus;
  errorCode?: string;
  errorMessage?: string;
  payload?: string;
  at: string;
}): { record: FollowUpRecord | null; deduped: boolean; applied: boolean; ignoredReason?: string } {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM follow_ups WHERE provider_message_id = ?")
    .get(input.providerMessageId) as FollowUpRow | undefined;
  if (!existing) return { record: null, deduped: false, applied: false, ignoredReason: "not_found" };

  const errorCodeNorm = (input.errorCode ?? "").trim();
  const errorMessageNorm = (input.errorMessage ?? "").trim();
  let deduped = false;
  try {
    db.prepare(
      `INSERT INTO follow_up_provider_events
       (id, follow_up_id, provider_message_id, provider_status, error_code_norm, error_message_norm, payload, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      makeId("fpe"),
      existing.id,
      input.providerMessageId,
      input.providerStatus,
      errorCodeNorm,
      errorMessageNorm,
      input.payload ?? "{}",
      input.at
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE constraint failed")) {
      deduped = true;
    } else {
      throw error;
    }
  }

  if (deduped) {
    return {
      record: getFollowUpById(existing.id),
      deduped: true,
      applied: false,
      ignoredReason: "duplicate_event"
    };
  }

  const currentStatus = existing.delivery_status ?? "queued";
  if (existing.status === "dead_letter") {
    return {
      record: getFollowUpById(existing.id),
      deduped: false,
      applied: false,
      ignoredReason: "dead_letter_terminal"
    };
  }
  if (currentStatus === "delivered" && input.providerStatus !== "delivered") {
    return {
      record: getFollowUpById(existing.id),
      deduped: false,
      applied: false,
      ignoredReason: "delivered_terminal"
    };
  }
  if (
    (currentStatus === "failed" || currentStatus === "undelivered") &&
    (input.providerStatus === "queued" || input.providerStatus === "sent")
  ) {
    return {
      record: getFollowUpById(existing.id),
      deduped: false,
      applied: false,
      ignoredReason: "out_of_order_regression"
    };
  }

  const isFailed = input.providerStatus === "undelivered" || input.providerStatus === "failed";
  db.prepare(
    `UPDATE follow_ups
     SET delivery_status = ?,
         status = CASE
           WHEN ? = 1 AND status != 'dead_letter' THEN 'failed'
           ELSE status
         END,
         delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END,
         failed_at = CASE WHEN ? = 1 THEN ? ELSE failed_at END,
         provider_error_code = ?,
         provider_error_message = ?,
         last_error = CASE WHEN ? = 1 THEN ? ELSE last_error END
     WHERE provider_message_id = ?`
  ).run(
    input.providerStatus,
    isFailed ? 1 : 0,
    input.providerStatus,
    input.at,
    isFailed ? 1 : 0,
    input.at,
    input.errorCode ?? null,
    input.errorMessage ?? null,
    isFailed ? 1 : 0,
    input.errorMessage ?? input.errorCode ?? null,
    input.providerMessageId
  );

  return { record: getFollowUpById(existing.id), deduped: false, applied: true };
}

export function getFollowUpById(id: string): FollowUpRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM follow_ups WHERE id = ?").get(id) as FollowUpRow | undefined;
  return row ? mapFollowUp(row) : null;
}

export function getFollowUpByProviderMessageId(providerMessageId: string): FollowUpRecord | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM follow_ups WHERE provider_message_id = ?")
    .get(providerMessageId) as FollowUpRow | undefined;
  return row ? mapFollowUp(row) : null;
}

export function listFollowUps(filters?: {
  patientId?: string;
  status?: "scheduled" | "sent" | "failed" | "dead_letter";
}): FollowUpRecord[] {
  const db = getDb();
  if (filters?.patientId && filters?.status) {
    const rows = db
      .prepare("SELECT * FROM follow_ups WHERE patient_id = ? AND status = ? ORDER BY scheduled_at DESC")
      .all(filters.patientId, filters.status) as FollowUpRow[];
    return rows.map(mapFollowUp);
  }
  if (filters?.patientId) {
    const rows = db
      .prepare("SELECT * FROM follow_ups WHERE patient_id = ? ORDER BY scheduled_at DESC")
      .all(filters.patientId) as FollowUpRow[];
    return rows.map(mapFollowUp);
  }
  if (filters?.status) {
    const rows = db
      .prepare("SELECT * FROM follow_ups WHERE status = ? ORDER BY scheduled_at DESC")
      .all(filters.status) as FollowUpRow[];
    return rows.map(mapFollowUp);
  }
  const rows = db.prepare("SELECT * FROM follow_ups ORDER BY scheduled_at DESC").all() as FollowUpRow[];
  return rows.map(mapFollowUp);
}

export function listDueFollowUps(limit = 50): FollowUpRecord[] {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT * FROM follow_ups
       WHERE status = 'scheduled' AND scheduled_at <= ?
       ORDER BY scheduled_at ASC
       LIMIT ?`
    )
    .all(now, limit) as FollowUpRow[];
  return rows.map(mapFollowUp);
}

export function listFailedFollowUps(limit = 50): FollowUpRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM follow_ups
       WHERE status = 'failed'
       ORDER BY scheduled_at ASC
       LIMIT ?`
    )
    .all(limit) as FollowUpRow[];
  return rows.map(mapFollowUp);
}

export function listFollowUpDeadLetters(limit = 50): FollowUpDeadLetterRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM follow_up_dead_letters
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit) as FollowUpDeadLetterRow[];
  return rows.map(mapFollowUpDeadLetter);
}

export function getFollowUpDeadLetterById(id: string): FollowUpDeadLetterRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM follow_up_dead_letters WHERE id = ?").get(id) as FollowUpDeadLetterRow | undefined;
  return row ? mapFollowUpDeadLetter(row) : null;
}

export function requeueFollowUpFromDeadLetter(deadLetterId: string, scheduledAt = nowIso()): FollowUpRecord {
  const db = getDb();
  const dead = db
    .prepare("SELECT * FROM follow_up_dead_letters WHERE id = ?")
    .get(deadLetterId) as FollowUpDeadLetterRow | undefined;
  if (!dead) {
    throw new Error("Dead-letter record not found");
  }

  const row = db
    .prepare("SELECT * FROM follow_ups WHERE id = ?")
    .get(dead.follow_up_id) as FollowUpRow | undefined;
  if (!row) {
    throw new Error("Follow-up not found");
  }
  if (row.status !== "dead_letter") {
    throw new Error("Only dead-letter follow-ups can be requeued");
  }

  db.prepare(
    `UPDATE follow_ups
     SET status = 'scheduled',
         delivery_status = 'queued',
         scheduled_at = ?,
         dead_lettered_at = NULL,
         provider_message_id = NULL,
         delivered_at = NULL,
         failed_at = NULL,
         provider_error_code = NULL,
         provider_error_message = NULL
     WHERE id = ?`
  ).run(scheduledAt, row.id);

  const updated = getFollowUpById(row.id);
  if (!updated) {
    throw new Error("Follow-up not found after requeue");
  }
  return updated;
}
