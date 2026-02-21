import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { StubAIClient } from "../ai/client.js";
import { resetConfigForTests } from "../config.js";
import { addDoctor } from "../doctors/store.js";
import { StubMessagingAdapter } from "../messaging/stub.js";
import { addPatient, markFollowUpSent, saveFollowUp } from "../patients/store.js";
import { createServer } from "../server.js";
import { setupTestDb, teardownTestDb } from "./test-helpers.js";
import { createIntent } from "../engine/intent.js";
import { executeIntent } from "../engine/executor.js";
import { createCapabilityHandlers } from "../runtime.js";

async function startTestServer(options?: { apiToken?: string; rateLimitMax?: number; rateLimitWindowMs?: number }) {
  if (options?.apiToken) {
    process.env.API_TOKEN = options.apiToken;
  } else {
    delete process.env.API_TOKEN;
  }
  if (options?.rateLimitMax !== undefined) {
    process.env.API_RATE_LIMIT_MAX = String(options.rateLimitMax);
  } else {
    delete process.env.API_RATE_LIMIT_MAX;
  }
  if (options?.rateLimitWindowMs !== undefined) {
    process.env.API_RATE_LIMIT_WINDOW_MS = String(options.rateLimitWindowMs);
  } else {
    delete process.env.API_RATE_LIMIT_WINDOW_MS;
  }
  resetConfigForTests();

  const ai = new StubAIClient((systemPrompt) => {
    if (systemPrompt.includes("SOAP")) {
      return JSON.stringify({
        subjective: "S",
        objective: "O",
        assessment: "A",
        plan: "P"
      });
    }
    if (systemPrompt.includes("clinical decision support")) {
      return JSON.stringify([{ type: "dosing", severity: "info", message: "ok", sources: ["x"] }]);
    }
    if (systemPrompt.includes("prior authorization")) {
      return JSON.stringify({ clinicalJustification: "needed" });
    }
    return JSON.stringify({ body: "Please call our office." });
  });

  const app = createServer({ aiClient: ai, messaging: new StubMessagingAdapter() });
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  };
}

test("api validation blocks malformed request", async () => {
  const dbPath = setupTestDb("server-validation");
  const svc = await startTestServer();
  try {
    const res = await fetch(`${svc.baseUrl}/api/scribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patientId: "p1", doctorId: "d1" })
    });
    assert.equal(res.status, 422);
    const body = (await res.json()) as { ok: boolean; code?: string };
    assert.equal(body.ok, false);
    assert.equal(body.code, "VALIDATION_ERROR");
  } finally {
    await svc.close();
    teardownTestDb(dbPath);
  }
});

test("api scribe returns note with valid payload", async () => {
  const dbPath = setupTestDb("server-scribe");
  const svc = await startTestServer();
  try {
    const doctor = addDoctor({ name: "Dr API", specialty: "general" });
    const patient = addPatient({ doctorId: doctor.id, name: "Pat API" });

    const res = await fetch(`${svc.baseUrl}/api/scribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transcript: "patient has cough",
        patientId: patient.id,
        doctorId: doctor.id
      })
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; data: { assessment: string } };
    assert.equal(body.ok, true);
    assert.equal(body.data.assessment, "A");
  } finally {
    await svc.close();
    teardownTestDb(dbPath);
  }
});

test("api auth blocks missing bearer token when API_TOKEN is set", async () => {
  const dbPath = setupTestDb("server-auth");
  const svc = await startTestServer({ apiToken: "secret-token" });
  try {
    const res = await fetch(`${svc.baseUrl}/api/replay`);
    assert.equal(res.status, 401);
    const body = (await res.json()) as { ok: boolean; code?: string };
    assert.equal(body.ok, false);
    assert.equal(body.code, "UNAUTHORIZED");
  } finally {
    await svc.close();
    teardownTestDb(dbPath);
  }
});

test("api auth allows valid bearer token", async () => {
  const dbPath = setupTestDb("server-auth-allowed");
  const svc = await startTestServer({ apiToken: "secret-token" });
  try {
    const res = await fetch(`${svc.baseUrl}/api/replay`, {
      headers: { authorization: "Bearer secret-token" }
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  } finally {
    await svc.close();
    teardownTestDb(dbPath);
  }
});

test("api prior-auth status update works with confirmation", async () => {
  const dbPath = setupTestDb("server-prior-auth-status");
  const svc = await startTestServer();
  try {
    const doctor = addDoctor({ name: "Dr API PA", specialty: "oncology" });
    const patient = addPatient({ doctorId: doctor.id, name: "Pat PA" });

    const createRes = await fetch(`${svc.baseUrl}/api/prior-auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        patientId: patient.id,
        doctorId: doctor.id,
        procedureCode: "99213",
        diagnosisCodes: ["Z00.00"],
        insurerId: "BCBS"
      })
    });
    assert.equal(createRes.status, 200);

    const listRes = await fetch(`${svc.baseUrl}/api/prior-auth?patientId=${encodeURIComponent(patient.id)}`);
    const listBody = (await listRes.json()) as {
      ok: boolean;
      data: Array<{ id: string; status: string }>;
    };
    assert.equal(listBody.ok, true);
    assert.equal(listBody.data.length, 1);

    const id = listBody.data[0].id;
    const statusRes = await fetch(`${svc.baseUrl}/api/prior-auth/${id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ doctorId: doctor.id, status: "submitted", confirm: true })
    });
    assert.equal(statusRes.status, 200);
    const statusBody = (await statusRes.json()) as { ok: boolean; data: { status: string } };
    assert.equal(statusBody.ok, true);
    assert.equal(statusBody.data.status, "submitted");
  } finally {
    await svc.close();
    teardownTestDb(dbPath);
  }
});

test("api follow-up retry executes for failed message with confirmation", async () => {
  const dbPath = setupTestDb("server-follow-up-retry");
  const svc = await startTestServer();
  try {
    const doctor = addDoctor({ name: "Dr API FU", specialty: "general" });
    const patient = addPatient({ doctorId: doctor.id, name: "Pat FU", phone: "+15551112222" });
    const row = saveFollowUp({
      patientId: patient.id,
      doctorId: doctor.id,
      trigger: "custom",
      body: "Please call clinic.",
      channel: "sms",
      scheduledAt: new Date().toISOString()
    });
    markFollowUpSent(row.id, "failed", new Date().toISOString());

    const res = await fetch(`${svc.baseUrl}/api/follow-up/${row.id}/retry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ doctorId: doctor.id, confirm: true, dryRun: true })
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; data: { status: string } };
    assert.equal(body.ok, true);
    assert.equal(body.data.status, "scheduled");
  } finally {
    await svc.close();
    teardownTestDb(dbPath);
  }
});

test("api follow-up dispatch processes due queue in dry-run mode", async () => {
  const dbPath = setupTestDb("server-follow-up-dispatch");
  const svc = await startTestServer();
  try {
    const doctor = addDoctor({ name: "Dr API Dispatch", specialty: "general" });
    const patient = addPatient({ doctorId: doctor.id, name: "Pat Dispatch", phone: "+15553334444" });
    saveFollowUp({
      patientId: patient.id,
      doctorId: doctor.id,
      trigger: "custom",
      body: "Please check in with the clinic.",
      channel: "sms",
      scheduledAt: new Date(Date.now() - 5_000).toISOString()
    });

    const res = await fetch(`${svc.baseUrl}/api/follow-up/dispatch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ doctorId: doctor.id, confirm: true, dryRun: true, limit: 10 })
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; data: { attempted: number; dryRun: boolean } };
    assert.equal(body.ok, true);
    assert.equal(body.data.attempted, 1);
    assert.equal(body.data.dryRun, true);
  } finally {
    await svc.close();
    teardownTestDb(dbPath);
  }
});

test("api follow-up bulk retry processes failed queue in dry-run mode", async () => {
  const dbPath = setupTestDb("server-follow-up-retry-bulk");
  const svc = await startTestServer();
  try {
    const doctor = addDoctor({ name: "Dr API Bulk", specialty: "general" });
    const patient = addPatient({ doctorId: doctor.id, name: "Pat Bulk", phone: "+15554445555" });
    const row = saveFollowUp({
      patientId: patient.id,
      doctorId: doctor.id,
      trigger: "custom",
      body: "Please call clinic.",
      channel: "sms",
      scheduledAt: new Date().toISOString()
    });
    markFollowUpSent(row.id, "failed", new Date().toISOString());

    const res = await fetch(`${svc.baseUrl}/api/follow-up/retry-failed-bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ doctorId: doctor.id, confirm: true, dryRun: true, limit: 10 })
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; data: { attempted: number; dryRun: boolean } };
    assert.equal(body.ok, true);
    assert.equal(body.data.attempted, 1);
    assert.equal(body.data.dryRun, true);
  } finally {
    await svc.close();
    teardownTestDb(dbPath);
  }
});

test("api ops metrics returns counts", async () => {
  const dbPath = setupTestDb("server-ops-metrics");
  const svc = await startTestServer();
  try {
    const doctor = addDoctor({ name: "Dr Metrics", specialty: "general" });
    addPatient({ doctorId: doctor.id, name: "Pat Metrics", phone: "+15550001111" });

    const res = await fetch(`${svc.baseUrl}/api/ops/metrics`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; data: { doctors: number; patients: number } };
    assert.equal(body.ok, true);
    assert.equal(body.data.doctors, 1);
    assert.equal(body.data.patients, 1);
  } finally {
    await svc.close();
    teardownTestDb(dbPath);
  }
});

test("api replay prune requires confirmation", async () => {
  const dbPath = setupTestDb("server-replay-prune");
  const svc = await startTestServer();
  try {
    const intent = createIntent({
      capability: "decision_support",
      doctorId: "d1",
      payload: { query: "q" },
      risk: "LOW",
      dryRun: true
    });
    await executeIntent(
      intent,
      createCapabilityHandlers({
        aiClient: new StubAIClient(() => JSON.stringify([{ type: "dosing", severity: "info", message: "ok", sources: ["x"] }])),
        messaging: new StubMessagingAdapter()
      }),
      { confirm: true, requestId: "req", actorId: "actor" }
    );

    const res = await fetch(`${svc.baseUrl}/api/replay/prune`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days: 1 })
    });
    assert.equal(res.status, 409);
    const body = (await res.json()) as { ok: boolean; code: string };
    assert.equal(body.ok, false);
    assert.equal(body.code, "RISK_CONFIRMATION_REQUIRED");
  } finally {
    await svc.close();
    teardownTestDb(dbPath);
  }
});

test("api decide returns structured alerts with disclaimer", async () => {
  const dbPath = setupTestDb("server-decide");
  const svc = await startTestServer();
  try {
    const res = await fetch(`${svc.baseUrl}/api/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "Can I combine these meds?" })
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok: boolean;
      data: Array<{ type: string; message: string }>;
    };
    assert.equal(body.ok, true);
    assert.equal(Array.isArray(body.data), true);
    assert.equal(body.data[body.data.length - 1]?.type, "disclaimer");
  } finally {
    await svc.close();
    teardownTestDb(dbPath);
  }
});

test("api rate limit returns 429 after threshold", async () => {
  const dbPath = setupTestDb("server-rate-limit");
  const svc = await startTestServer({ rateLimitMax: 1, rateLimitWindowMs: 60_000 });
  try {
    const first = await fetch(`${svc.baseUrl}/api/replay`);
    assert.equal(first.status, 200);

    const second = await fetch(`${svc.baseUrl}/api/replay`);
    assert.equal(second.status, 429);
    const body = (await second.json()) as { ok: boolean; code?: string };
    assert.equal(body.ok, false);
    assert.equal(body.code, "RATE_LIMITED");
  } finally {
    await svc.close();
    teardownTestDb(dbPath);
  }
});

test("api scope blocks admin endpoint for read-only scope", async () => {
  const dbPath = setupTestDb("server-scope-block");
  const svc = await startTestServer();
  try {
    const res = await fetch(`${svc.baseUrl}/api/ops/metrics`, {
      headers: { "x-token-scope": "read" }
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { ok: boolean; code?: string };
    assert.equal(body.ok, false);
    assert.equal(body.code, "FORBIDDEN");
  } finally {
    await svc.close();
    teardownTestDb(dbPath);
  }
});

test("api scope allows admin endpoint for admin scope", async () => {
  const dbPath = setupTestDb("server-scope-allow");
  const svc = await startTestServer();
  try {
    const res = await fetch(`${svc.baseUrl}/api/ops/metrics`, {
      headers: { "x-token-scope": "admin" }
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  } finally {
    await svc.close();
    teardownTestDb(dbPath);
  }
});
