import { getDb } from "../db/client.js";
import { makeId, nowIso, safeJsonParse } from "../utils.js";
import { FollowUpRecord, Patient } from "./types.js";

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
  status: "scheduled" | "sent" | "failed";
  retry_count?: number;
  last_error?: string | null;
  created_at: string;
}

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
    retryCount: row.retry_count ?? 0,
    lastError: row.last_error ?? undefined,
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
     (id, patient_id, doctor_id, trigger, body, channel, scheduled_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    record.id,
    record.patientId,
    record.doctorId,
    record.trigger,
    record.body,
    record.channel,
    record.scheduledAt,
    record.status,
    record.createdAt
  );

  return record;
}

export function markFollowUpSent(id: string, status: "sent" | "failed", sentAt: string): void {
  const db = getDb();
  db.prepare("UPDATE follow_ups SET status = ?, sent_at = ? WHERE id = ?").run(status, sentAt, id);
}

export function markFollowUpFailedWithBackoff(id: string, retryCount: number, errorMessage: string, nextScheduledAt: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE follow_ups
     SET status = 'scheduled',
         retry_count = ?,
         last_error = ?,
         scheduled_at = ?,
         sent_at = NULL
     WHERE id = ?`
  ).run(retryCount, errorMessage.slice(0, 500), nextScheduledAt, id);
}

export function getFollowUpById(id: string): FollowUpRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM follow_ups WHERE id = ?").get(id) as FollowUpRow | undefined;
  return row ? mapFollowUp(row) : null;
}

export function listFollowUps(filters?: {
  patientId?: string;
  status?: "scheduled" | "sent" | "failed";
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
