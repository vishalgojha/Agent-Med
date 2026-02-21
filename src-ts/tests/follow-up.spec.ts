import test from "node:test";
import assert from "node:assert/strict";
import { StubAIClient } from "../ai/client.js";
import { runFollowUp } from "../capabilities/follow-up.js";
import { addDoctor } from "../doctors/store.js";
import { StubMessagingAdapter } from "../messaging/stub.js";
import { addPatient } from "../patients/store.js";
import { setupTestDb, teardownTestDb } from "./test-helpers.js";

test("follow-up dry-run schedules without sending", async () => {
  const dbPath = setupTestDb("follow-up");
  try {
    const doctor = addDoctor({ name: "Dr. Gray", specialty: "psychiatry" });
    const patient = addPatient({ doctorId: doctor.id, name: "Mary Jane", phone: "+15551234567" });

    const ai = new StubAIClient(() => JSON.stringify({ body: "Your results are ready, please call our office." }));
    const messaging = new StubMessagingAdapter();

    const message = await runFollowUp({
      patientId: patient.id,
      doctorId: doctor.id,
      trigger: "lab_result",
      dryRun: true,
      aiClient: ai,
      messaging
    });

    assert.equal(message.status, "scheduled");
    assert.equal(messaging.sent.length, 0);
    assert.match(message.body, /results are ready/i);
  } finally {
    teardownTestDb(dbPath);
  }
});
