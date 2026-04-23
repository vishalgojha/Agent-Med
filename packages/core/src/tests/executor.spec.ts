import test from "node:test";
import assert from "node:assert/strict";
import { executeIntent } from "../engine/executor.js";
import { createIntent } from "../engine/intent.js";
import { setupTestDb, teardownTestDb } from "./test-helpers.js";

test("executor blocks HIGH risk without confirm", async () => {
  const dbPath = setupTestDb("executor");
  try {
    const intent = createIntent({
      capability: "prior_auth",
      doctorId: "d1",
      patientId: "p1",
      payload: {},
      risk: "HIGH",
      dryRun: false
    });

    const result = await executeIntent(intent, {
      scribe: async () => ({}),
      prior_auth: async () => ({ ok: true }),
      follow_up: async () => ({}),
      decision_support: async () => []
    });

    assert.equal(result.ok, false);
    if (result.ok === false) {
      assert.equal(result.blocked, true);
      assert.equal(result.requiredConfirmation, true);
    }
  } finally {
    teardownTestDb(dbPath);
  }
});
