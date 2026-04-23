import test from "node:test";
import assert from "node:assert/strict";
import { StubAIClient } from "../ai/client.js";
import { retryFailedFollowUp, runFollowUp } from "../capabilities/follow-up.js";
import { getDb } from "../db/client.js";
import { addDoctor } from "../doctors/store.js";
import { StubMessagingAdapter } from "../messaging/stub.js";
import {
  addPatient,
  getFollowUpById,
  listFollowUpDeadLetters,
  markFollowUpSent,
  saveFollowUp
} from "../patients/store.js";
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

test("follow-up retry moves item to dead-letter when max retries exceeded", async () => {
  const dbPath = setupTestDb("follow-up-dead-letter");
  try {
    const doctor = addDoctor({ name: "Dr. Dead", specialty: "general" });
    const patient = addPatient({ doctorId: doctor.id, name: "Retry Patient", phone: "+15558889999" });
    const row = saveFollowUp({
      patientId: patient.id,
      doctorId: doctor.id,
      trigger: "custom",
      body: "Please call clinic.",
      channel: "sms",
      scheduledAt: new Date().toISOString()
    });
    markFollowUpSent(row.id, "failed", new Date().toISOString());
    getDb().prepare("UPDATE follow_ups SET retry_count = 5 WHERE id = ?").run(row.id);

    const failingMessaging = {
      async send() {
        throw new Error("provider timeout");
      }
    };

    const result = await retryFailedFollowUp({
      id: row.id,
      messaging: failingMessaging
    });

    assert.equal(result.status, "dead_letter");
    const updated = getFollowUpById(row.id);
    assert.equal(updated?.status, "dead_letter");
    assert.equal((updated?.retryCount ?? 0) > 5, true);
    const deadLetters = listFollowUpDeadLetters(10);
    assert.equal(deadLetters.length, 1);
    assert.equal(deadLetters[0].followUpId, row.id);
    assert.equal(deadLetters[0].reason, "max_retry_exceeded");
  } finally {
    teardownTestDb(dbPath);
  }
});
