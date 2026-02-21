import { getDb } from "../db/client.js";
import { makeId, nowIso } from "../utils.js";
import { Specialty } from "../types.js";
import { DoctorProfile } from "./types.js";

interface DoctorRow {
  id: string;
  name: string;
  specialty: Specialty;
  created_at: string;
}

function mapDoctor(row: DoctorRow): DoctorProfile {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    createdAt: row.created_at
  };
}

export function addDoctor(input: { name: string; specialty: Specialty; id?: string }): DoctorProfile {
  const db = getDb();
  const doctor: DoctorProfile = {
    id: input.id ?? makeId("d"),
    name: input.name,
    specialty: input.specialty,
    createdAt: nowIso()
  };

  db.prepare(
    `INSERT INTO doctors (id, name, specialty, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(doctor.id, doctor.name, doctor.specialty, doctor.createdAt);

  return doctor;
}

export function getDoctorById(id: string): DoctorProfile | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM doctors WHERE id = ?").get(id) as DoctorRow | undefined;
  return row ? mapDoctor(row) : null;
}

export function listDoctors(): DoctorProfile[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM doctors ORDER BY created_at DESC").all() as DoctorRow[];
  return rows.map(mapDoctor);
}
