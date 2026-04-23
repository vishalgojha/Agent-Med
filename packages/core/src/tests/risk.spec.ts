import test from "node:test";
import assert from "node:assert/strict";
import { checkRiskGate } from "../engine/risk.js";
import { createIntent } from "../engine/intent.js";

test("risk gate allows medium without confirmation", () => {
  const intent = createIntent({
    capability: "follow_up",
    doctorId: "d1",
    payload: {},
    risk: "MEDIUM",
    dryRun: false
  });

  const gate = checkRiskGate(intent, {});
  assert.equal(gate, true);
});

test("risk gate blocks high without confirmation", () => {
  const intent = createIntent({
    capability: "prior_auth",
    doctorId: "d1",
    payload: {},
    risk: "HIGH",
    dryRun: false
  });

  const gate = checkRiskGate(intent, {});
  assert.notEqual(gate, true);
  if (gate !== true) {
    assert.equal(gate.requiredConfirmation, true);
  }
});
