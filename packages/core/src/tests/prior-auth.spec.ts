import test from "node:test";
import assert from "node:assert/strict";
import { StubAIClient } from "../ai/client.js";
import { runPriorAuth } from "../capabilities/prior-auth.js";
import { addDoctor } from "../doctors/store.js";
import { addPatient } from "../patients/store.js";
import { setupTestDb, teardownTestDb } from "./test-helpers.js";

test("prior-auth creates draft with AI justification", async () => {
  const dbPath = setupTestDb("prior-auth");
  try {
    const doctor = addDoctor({ name: "Dr. Kent", specialty: "oncology" });
    const patient = addPatient({ doctorId: doctor.id, name: "John Smith", dob: "1980-01-01" });

    const ai = new StubAIClient(() => JSON.stringify({ clinicalJustification: "Procedure is medically necessary." }));

    const draft = await runPriorAuth({
      patientId: patient.id,
      procedureCode: "99213",
      diagnosisCodes: ["Z00.00"],
      insurerId: "BCBS",
      aiClient: ai
    });

    assert.equal(draft.procedureCode, "99213");
    assert.equal(draft.status, "draft");
    assert.match(draft.clinicalJustification, /medically necessary/i);
  } finally {
    teardownTestDb(dbPath);
  }
});
