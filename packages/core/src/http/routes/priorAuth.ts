import { Router } from "express";
import { getPriorAuthById, listPriorAuths } from "../../capabilities/prior-auth.js";
import { createIntent } from "../../engine/intent.js";
import { executeIntent } from "../../engine/executor.js";
import { createCapabilityHandlers } from "../../runtime.js";
import { requireScope } from "../middleware/auth.js";
import { sendJson } from "../../utils.js";
import { asObject, requireString, splitCsv } from "../../utils.js";
import { RuntimeDeps } from "../../runtime.js";

export function registerPriorAuthRoutes(router: Router, deps: RuntimeDeps) {
  router.get("/", (req, res) => {
    if (!requireScope(req, res, "read")) return;
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    sendJson(res, 200, { ok: true, data: listPriorAuths(patientId) });
  });

  router.get("/:id", (req, res) => {
    if (!requireScope(req, res, "read")) return;
    const row = getPriorAuthById(req.params.id);
    if (!row) {
      sendJson(res, 404, { ok: false, code: "NOT_FOUND", message: "Prior auth not found" });
      return;
    }
    sendJson(res, 200, { ok: true, data: row });
  });

  router.post("/", async (req, res) => {
    if (!requireScope(req, res, "write")) return;
    const body = asObject(req.body);
    if (!body) {
      sendJson(res, 400, { ok: false, code: "VALIDATION_ERROR", message: "Request body must be a JSON object" });
      return;
    }
    const patientId = requireString(body, "patientId");
    const doctorId = requireString(body, "doctorId");
    const procedureCode = requireString(body, "procedureCode");
    const insurerId = requireString(body, "insurerId");
    if (!patientId || !doctorId || !procedureCode || !insurerId) {
      sendJson(res, 422, { ok: false, code: "VALIDATION_ERROR", message: "Missing required fields" });
      return;
    }
    const intent = createIntent({
      capability: "prior_auth",
      doctorId,
      patientId,
      risk: Boolean(body.submit) ? "HIGH" : "MEDIUM",
      dryRun: false,
      payload: {
        patientId,
        procedureCode,
        diagnosisCodes: String(body.diagnosisCodes ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
        insurerId,
        submit: Boolean(body.submit)
      }
    });
    const result = await executeIntent(intent, createCapabilityHandlers(deps), {
      confirm: Boolean(body.confirm),
      requestId: String(req.headers["x-request-id"] ?? ""),
      actorId: String(req.headers["x-actor-id"] ?? "system")
    });
    if (result.ok === false) {
      sendJson(res, result.blocked ? 409 : 400, result);
      return;
    }
    sendJson(res, 200, { ok: true, data: result.output });
  });

  router.patch("/:id/status", async (req, res) => {
    if (!requireScope(req, res, "write")) return;
    const body = asObject(req.body);
    if (!body) {
      sendJson(res, 400, { ok: false, code: "VALIDATION_ERROR", message: "Request body must be a JSON object" });
      return;
    }
    const status = requireString(body, "status");
    if (!status) {
      sendJson(res, 422, { ok: false, code: "VALIDATION_ERROR", message: "status is required" });
      return;
    }
    const intent = createIntent({
      capability: "prior_auth",
      doctorId: String(body.doctorId ?? "d_api"),
      payload: {
        mode: "status_update",
        priorAuthId: req.params.id,
        status
      },
      risk: "HIGH",
      dryRun: false
    });
    const result = await executeIntent(intent, createCapabilityHandlers(deps), {
      confirm: Boolean(body.confirm),
      requestId: String(req.headers["x-request-id"] ?? ""),
      actorId: String(req.headers["x-actor-id"] ?? "system")
    });
    if (result.ok === false) {
      sendJson(res, result.blocked ? 409 : 400, result);
      return;
    }
    sendJson(res, 200, { ok: true, data: result.output });
  });
}
