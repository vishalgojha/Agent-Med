import test from "node:test";
import assert from "node:assert/strict";
import { StubAIClient } from "../ai/client.js";
import { runScribe } from "../capabilities/scribe.js";
import { addDoctor } from "../doctors/store.js";
import { addPatient } from "../patients/store.js";
import { setupTestDb, teardownTestDb } from "./test-helpers.js";

test("scribe creates SOAP note and deduplicates by transcript hash", async () => {
  const dbPath = setupTestDb("scribe");
  try {
    const doctor = addDoctor({ name: "Dr. Stone", specialty: "primary_care" });
    const patient = addPatient({ doctorId: doctor.id, name: "Jane Doe" });

    const ai = new StubAIClient(() =>
      JSON.stringify({
        subjective: "Headache for two days",
        objective: "Vitals stable",
        assessment: "Tension headache",
        plan: "Hydration and NSAID"
      })
    );

    const transcript = "Patient has headache and no neuro deficits.";
    const first = await runScribe({ transcript, patientId: patient.id, doctorId: doctor.id, aiClient: ai });
    const second = await runScribe({ transcript, patientId: patient.id, doctorId: doctor.id, aiClient: ai });

    assert.equal(first.transcriptHash, second.transcriptHash);
    assert.equal(first.assessment, "Tension headache");
    assert.equal(second.plan, "Hydration and NSAID");
  } finally {
    teardownTestDb(dbPath);
  }
});
