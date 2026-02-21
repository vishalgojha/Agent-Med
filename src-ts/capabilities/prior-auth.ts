import { AIClient } from "../ai/client.js";
import { loadPrompt } from "../ai/prompts.js";
import { getDb } from "../db/client.js";
import { getDoctorById } from "../doctors/store.js";
import { getPatientById } from "../patients/store.js";
import { PriorAuthDraft } from "../types.js";
import { makeId, nowIso, safeJsonParse } from "../utils.js";

export type PriorAuthStatus = "draft" | "submitted" | "approved" | "denied" | "pending";

export interface PriorAuthRecord {
  id: string;
  patientId: string;
  procedureCode: string;
  diagnosisCodes: string[];
  insurerId: string;
  clinicalJustification: string;
  status: PriorAuthStatus;
  createdAt: string;
  updatedAt: string;
}

interface PriorAuthRow {
  id: string;
  patient_id: string;
  procedure_code: string;
  diagnosis_codes: string;
  insurer_id: string;
  clinical_justification: string | null;
  status: PriorAuthStatus;
  created_at: string;
  updated_at: string;
}

function mapPriorAuthRow(row: PriorAuthRow): PriorAuthRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    procedureCode: row.procedure_code,
    diagnosisCodes: safeJsonParse<string[]>(row.diagnosis_codes ?? "[]", []),
    insurerId: row.insurer_id,
    clinicalJustification: row.clinical_justification ?? "",
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function runPriorAuth(input: {
  patientId: string;
  doctorId?: string;
  procedureCode: string;
  diagnosisCodes: string[];
  insurerId: string;
  submit?: boolean;
  aiClient: AIClient;
}): Promise<PriorAuthDraft> {
  const patient = getPatientById(input.patientId);
  if (!patient) {
    throw new Error("Patient not found");
  }
  const doctor = input.doctorId ? getDoctorById(input.doctorId) : null;

  const userPayload = JSON.stringify(
    {
      patientName: patient.name,
      dob: patient.dob ?? "",
      procedureCode: input.procedureCode,
      diagnosisCodes: input.diagnosisCodes,
      insurerId: input.insurerId,
      specialtyHint: doctor?.specialty ?? "general"
    },
    null,
    2
  );

  const schema = JSON.stringify(
    {
      type: "object",
      properties: {
        clinicalJustification: { type: "string" }
      },
      required: ["clinicalJustification"]
    },
    null,
    2
  );

  const parsed = await input.aiClient.completeStructured<{ clinicalJustification: string }>(
    loadPrompt("prior-auth"),
    userPayload,
    schema
  );

  const now = nowIso();
  const draft: PriorAuthDraft = {
    patientName: patient.name,
    dob: patient.dob ?? "",
    insurerId: input.insurerId,
    procedureCode: input.procedureCode,
    diagnosisCodes: input.diagnosisCodes,
    clinicalJustification: parsed.clinicalJustification,
    attachments: [],
    status: input.submit ? "submitted" : "draft"
  };

  const db = getDb();
  db.prepare(
    `INSERT INTO prior_auths
     (id, patient_id, procedure_code, diagnosis_codes, insurer_id, clinical_justification, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    makeId("pa"),
    input.patientId,
    draft.procedureCode,
    JSON.stringify(draft.diagnosisCodes),
    draft.insurerId,
    draft.clinicalJustification,
    input.submit ? "submitted" : "draft",
    now,
    now
  );

  return draft;
}

export function listPriorAuths(patientId?: string): PriorAuthRecord[] {
  const db = getDb();
  if (patientId) {
    const rows = db
      .prepare("SELECT * FROM prior_auths WHERE patient_id = ? ORDER BY updated_at DESC")
      .all(patientId) as PriorAuthRow[];
    return rows.map(mapPriorAuthRow);
  }
  const rows = db.prepare("SELECT * FROM prior_auths ORDER BY updated_at DESC").all() as PriorAuthRow[];
  return rows.map(mapPriorAuthRow);
}

export function getPriorAuthById(id: string): PriorAuthRecord | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM prior_auths WHERE id = ?").get(id) as PriorAuthRow | undefined;
  return row ? mapPriorAuthRow(row) : null;
}

export function updatePriorAuthStatus(id: string, status: PriorAuthStatus): PriorAuthRecord {
  const allowed: PriorAuthStatus[] = ["draft", "submitted", "approved", "denied", "pending"];
  if (!allowed.includes(status)) {
    throw new Error("Invalid prior auth status");
  }
  const db = getDb();
  const now = nowIso();
  const changed = db
    .prepare("UPDATE prior_auths SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, now, id);
  if (changed.changes === 0) {
    throw new Error("Prior auth not found");
  }
  const updated = getPriorAuthById(id);
  if (!updated) {
    throw new Error("Prior auth not found after update");
  }
  return updated;
}
