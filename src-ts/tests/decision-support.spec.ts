import test from "node:test";
import assert from "node:assert/strict";
import { StubAIClient } from "../ai/client.js";
import { runDecisionSupport } from "../capabilities/decision-support.js";
import { setupTestDb, teardownTestDb } from "./test-helpers.js";

test("decision support sorts critical first and appends disclaimer", async () => {
  const dbPath = setupTestDb("decision");
  try {
    const ai = new StubAIClient(() =>
      JSON.stringify([
        { type: "dosing", severity: "warn", message: "Dose may be high", sources: ["Guide A"] },
        { type: "drug_interaction", severity: "critical", message: "Major interaction", sources: ["Guide B"] }
      ])
    );

    const alerts = await runDecisionSupport({ aiClient: ai, query: "Can I combine meds?" });

    assert.equal(alerts[0]?.severity, "critical");
    assert.equal(alerts[alerts.length - 1]?.type, "disclaimer");
  } finally {
    teardownTestDb(dbPath);
  }
});
