import test from "node:test";
import assert from "node:assert/strict";
import { createIntent } from "../engine/intent.js";
import { executeIntent } from "../engine/executor.js";
import { listReplay } from "../engine/replay.js";
import { setupTestDb, teardownTestDb } from "./test-helpers.js";

test("replay rows include request and actor metadata", async () => {
  const dbPath = setupTestDb("replay-audit");
  try {
    const intent = createIntent({
      capability: "decision_support",
      doctorId: "d_meta",
      payload: { query: "q" },
      risk: "LOW",
      dryRun: true
    });

    const result = await executeIntent(
      intent,
      {
        scribe: async () => ({}),
        prior_auth: async () => ({}),
        follow_up: async () => ({}),
        decision_support: async () => []
      },
      { confirm: true, requestId: "req-1", actorId: "actor-1" }
    );

    assert.equal(result.ok, true);
    const rows = listReplay(1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].request_id, "req-1");
    assert.equal(rows[0].actor_id, "actor-1");
  } finally {
    teardownTestDb(dbPath);
  }
});
