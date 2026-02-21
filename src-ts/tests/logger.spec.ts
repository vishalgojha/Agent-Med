import test from "node:test";
import assert from "node:assert/strict";
import { redact } from "../logger.js";

test("redact removes PHI keys", () => {
  const input = {
    name: "Jane Doe",
    dob: "1980-01-01",
    phone: "+15551234567",
    to: "+15550987654",
    nested: { patientName: "John" }
  };

  const out = redact(input);
  assert.equal(out.name, "[REDACTED]");
  assert.equal(out.dob, "[REDACTED]");
  assert.equal(out.phone, "[REDACTED]");
  assert.equal(out.to, "[REDACTED]");
  assert.equal(out.nested.patientName, "[REDACTED]");
});
