import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AIClient } from "../ai/client.js";
import { loadPrompt } from "../ai/prompts.js";
import { getDb } from "../db/client.js";
import { SOAPNote } from "../types.js";
import { makeId, nowIso } from "../utils.js";

interface NoteRow {
  id: string;
  transcript_hash: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  created_at: string;
}

export async function runScribe(input: {
  transcript?: string;
  filePath?: string;
  patientId: string;
  doctorId: string;
  aiClient: AIClient;
}): Promise<SOAPNote> {
  const transcript = input.transcript ?? (input.filePath ? readFileSync(input.filePath, "utf8") : "");
  if (!transcript.trim()) {
    throw new Error("Transcript input is required");
  }

  const transcriptHash = createHash("sha256").update(transcript).digest("hex");
  const db = getDb();

  const cached = db
    .prepare("SELECT * FROM notes WHERE transcript_hash = ?")
    .get(transcriptHash) as NoteRow | undefined;

  if (cached) {
    return {
      subjective: cached.subjective,
      objective: cached.objective,
      assessment: cached.assessment,
      plan: cached.plan,
      generatedAt: cached.created_at,
      transcriptHash: cached.transcript_hash
    };
  }

  const schema = JSON.stringify(
    {
      type: "object",
      properties: {
        subjective: { type: "string" },
        objective: { type: "string" },
        assessment: { type: "string" },
        plan: { type: "string" }
      },
      required: ["subjective", "objective", "assessment", "plan"]
    },
    null,
    2
  );

  const parsed = await input.aiClient.completeStructured<{
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  }>(loadPrompt("scribe"), transcript, schema);

  const generatedAt = nowIso();
  db.prepare(
    `INSERT INTO notes
     (id, patient_id, doctor_id, transcript_hash, subjective, objective, assessment, plan, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    makeId("note"),
    input.patientId,
    input.doctorId,
    transcriptHash,
    parsed.subjective,
    parsed.objective,
    parsed.assessment,
    parsed.plan,
    generatedAt
  );

  return {
    ...parsed,
    generatedAt,
    transcriptHash
  };
}
