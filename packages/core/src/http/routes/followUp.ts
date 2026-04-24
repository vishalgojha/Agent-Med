import { Router } from "express";
import { 
  listPendingDeliveries,
  getPendingDeliveryById,
  inspectPendingDeliveriesByIds,
  removePendingDeliveryById,
  removePendingDeliveriesByIds,
  listFailedDeliveries,
  getFailedDeliveryById,
  requeueFailedDelivery,
  retryFailedDeliveryNow
} from "../../messaging/delivery-queue.js";
import { 
  listFollowUps, 
  listFollowUpDeadLetters, 
  getFollowUpByProviderMessageId, 
  updateFollowUpDeliveryByProviderMessageId 
} from "../../patients/store.js";
import { createIntent } from "../../engine/intent.js";
import { executeIntent } from "../../engine/executor.js";
import { createCapabilityHandlers } from "../../runtime.js";
import { requireScope } from "../middleware/auth.js";
import { sendJson, asObject, splitCsv, requireStringArray } from "../../utils.js";
import { RuntimeDeps } from "../../runtime.js";

export function registerFollowUpRoutes(router: Router, deps: RuntimeDeps) {
  router.get("/", (req, res) => {
    if (!requireScope(req, res, "read")) return;
    const patientId = typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const validStatus = ["scheduled", "sent", "failed", "dead_letter"].includes(status!) ? status : undefined;
    sendJson(res, 200, { ok: true, data: listFollowUps({ patientId, status: validStatus }) });
  });

  router.get("/dead-letter", (req, res) => {
    if (!requireScope(req, res, "read")) return;
    const limit = Number(req.query.limit ?? 50);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 50;
    sendJson(res, 200, { ok: true, data: listFollowUpDeadLetters(safeLimit) });
  });

  router.post("/dead-letter/:id/requeue", async (req, res) => {
    if (!requireScope(req, res, "write")) return;
    const body = asObject(req.body) ?? {};
    const intent = createIntent({
      capability: "follow_up",
      doctorId: String(body.doctorId ?? "d_api"),
      payload: {
        mode: "requeue_dead_letter",
        deadLetterId: req.params.id
      },
      risk: "MEDIUM",
      dryRun: Boolean(body.dryRun)
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

  router.post("/", async (req, res) => {
    if (!requireScope(req, res, "write")) return;
    const body = asObject(req.body);
    if (!body) {
      sendJson(res, 400, { ok: false, code: "VALIDATION_ERROR", message: "Request body must be a JSON object" });
      return;
    }
    const intent = createIntent({
      capability: "follow_up",
      doctorId: String(body.doctorId ?? "d_api"),
      patientId: body.patientId ? String(body.patientId) : undefined,
      risk: (body.sendNow === true) ? "HIGH" : "MEDIUM",
      dryRun: Boolean(body.dryRun),
      payload: {
        patientId: body.patientId,
        trigger: String(body.trigger ?? "lab_result"),
        customMessage: String(body.customMessage ?? ""),
        channel: body.channel ?? "sms",
        sendNow: Boolean(body.sendNow)
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

  router.post("/retry-failed/:id", async (req, res) => {
    if (!requireScope(req, res, "write")) return;
    const body = asObject(req.body) ?? {};
    const followUpId = req.params.id;
    try {
      const intent = createIntent({
        capability: "follow_up",
        doctorId: String(body.doctorId ?? "d_api"),
        payload: {
          mode: "retry_failed",
          followUpId
        },
        risk: "HIGH",
        dryRun: Boolean(body.dryRun)
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
    } catch (err: any) {
      if (err.message?.includes("not found")) {
        sendJson(res, 404, { ok: false, code: "NOT_FOUND", message: err.message });
        return;
      }
      sendJson(res, 500, { ok: false, code: "INTERNAL_ERROR", message: err.message });
    }
  });

  router.post("/retry/:id", async (req, res) => {
    if (!requireScope(req, res, "write")) return;
    const body = asObject(req.body) ?? {};
    const followUpId = req.params.id;
    try {
      const intent = createIntent({
        capability: "follow_up",
        doctorId: String(body.doctorId ?? "d_api"),
        payload: {
          mode: "retry_failed",
          followUpId
        },
        risk: "HIGH",
        dryRun: Boolean(body.dryRun)
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
    } catch (err: any) {
      if (err.message?.includes("not found")) {
        sendJson(res, 404, { ok: false, code: "NOT_FOUND", message: err.message });
        return;
      }
      sendJson(res, 500, { ok: false, code: "INTERNAL_ERROR", message: err.message });
    }
  });

  router.post("/:id/retry", async (req, res) => {
    if (!requireScope(req, res, "write")) return;
    const body = asObject(req.body) ?? {};
    const followUpId = req.params.id;
    try {
      const intent = createIntent({
        capability: "follow_up",
        doctorId: String(body.doctorId ?? "d_api"),
        payload: {
          mode: "retry_failed",
          followUpId
        },
        risk: "HIGH",
        dryRun: Boolean(body.dryRun)
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
    } catch (err: any) {
      if (err.message?.includes("not found")) {
        sendJson(res, 404, { ok: false, code: "NOT_FOUND", message: err.message });
        return;
      }
      sendJson(res, 500, { ok: false, code: "INTERNAL_ERROR", message: err.message });
    }
  });

  router.post("/dispatch", async (req, res) => {
    if (!requireScope(req, res, "write")) return;
    const body = asObject(req.body) ?? {};
    const limit = Number(body.limit ?? 50);
    const intent = createIntent({
      capability: "follow_up",
      doctorId: String(body.doctorId ?? "d_api"),
      payload: { mode: "dispatch_due", limit },
      risk: "HIGH",
      dryRun: Boolean(body.dryRun)
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

  router.post("/retry-failed-bulk", async (req, res) => {
    if (!requireScope(req, res, "write")) return;
    const body = asObject(req.body) ?? {};
    const limit = Number(body.limit ?? 25);
    const intent = createIntent({
      capability: "follow_up",
      doctorId: String(body.doctorId ?? "d_api"),
      payload: { mode: "retry_failed_bulk", limit },
      risk: "HIGH",
      dryRun: Boolean(body.dryRun)
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

  router.get("/queue/pending", async (req, res) => {
    if (!requireScope(req, res, "admin")) return;
    const limit = Number(req.query.limit ?? 50);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 50;
    const entries = await listPendingDeliveries(safeLimit);
    sendJson(res, 200, { ok: true, data: entries });
  });

  router.get("/queue/pending/:id", async (req, res) => {
    if (!requireScope(req, res, "admin")) return;
    const row = await getPendingDeliveryById(req.params.id);
    if (!row) {
      sendJson(res, 404, { ok: false, code: "NOT_FOUND", message: "Pending delivery not found" });
      return;
    }
    sendJson(res, 200, { ok: true, data: row });
  });

  router.delete("/queue/pending/:id", async (req, res) => {
    if (!requireScope(req, res, "admin")) return;
    const body = asObject(req.body) ?? {};
    const dryRun = Boolean(body.dryRun);
    const confirm = Boolean(body.confirm);
    const row = await getPendingDeliveryById(req.params.id);
    if (!row) {
      sendJson(res, 404, { ok: false, code: "NOT_FOUND", message: "Pending delivery not found" });
      return;
    }
    if (dryRun) {
      sendJson(res, 200, { ok: true, data: { status: "dry_run", entry: row } });
      return;
    }
    if (!confirm) {
      sendJson(res, 409, { ok: false, code: "RISK_CONFIRMATION_REQUIRED", message: "Pending queue cancel requires confirm=true", requiredConfirmation: true });
      return;
    }
    const cancelled = await removePendingDeliveryById(req.params.id);
    sendJson(res, 200, { ok: true, data: { status: "cancelled", entry: cancelled } });
  });

  router.post("/queue/pending/cancel-bulk", async (req, res) => {
    if (!requireScope(req, res, "admin")) return;
    const body = asObject(req.body) ?? {};
    const ids = requireStringArray(body, "ids");
    if (!ids || ids.length === 0) {
      sendJson(res, 422, { ok: false, code: "VALIDATION_ERROR", message: "ids must be a non-empty string[]" });
      return;
    }
    const queueIds = Array.from(new Set(ids.map((id) => id.trim())));
    if (queueIds.length > 500) {
      sendJson(res, 422, { ok: false, code: "VALIDATION_ERROR", message: "ids must contain at most 500 queue ids" });
      return;
    }
    const dryRun = Boolean(body.dryRun);
    const confirm = Boolean(body.confirm);
    if (dryRun) {
      const preview = await inspectPendingDeliveriesByIds(queueIds);
      sendJson(res, 200, { ok: true, data: { status: "dry_run", attempted: queueIds.length, entries: preview.entries, missingIds: preview.missingIds } });
      return;
    }
    if (!confirm) {
      sendJson(res, 409, { ok: false, code: "RISK_CONFIRMATION_REQUIRED", message: "Pending queue bulk cancel requires confirm=true", requiredConfirmation: true });
      return;
    }
    const cancelled = await removePendingDeliveriesByIds(queueIds);
    sendJson(res, 200, { ok: true, data: { status: "cancelled", attempted: queueIds.length, cancelled: cancelled.cancelled, missingIds: cancelled.missingIds } });
  });

  router.get("/queue/failed", async (req, res) => {
    if (!requireScope(req, res, "admin")) return;
    const limit = Number(req.query.limit ?? 50);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 500) : 50;
    const entries = await listFailedDeliveries(safeLimit);
    sendJson(res, 200, { ok: true, data: entries });
  });

  router.get("/queue/failed/:id", async (req, res) => {
    if (!requireScope(req, res, "admin")) return;
    const row = await getFailedDeliveryById(req.params.id);
    if (!row) {
      sendJson(res, 404, { ok: false, code: "NOT_FOUND", message: "Failed delivery not found" });
      return;
    }
    sendJson(res, 200, { ok: true, data: row });
  });

  router.post("/queue/failed/:id/requeue", async (req, res) => {
    if (!requireScope(req, res, "admin")) return;
    const body = asObject(req.body) ?? {};
    const resetRetryCount = Boolean(body.resetRetryCount);
    const row = await requeueFailedDelivery({ queueId: req.params.id, resetRetryCount });
    sendJson(res, 200, { ok: true, data: row });
  });

  router.post("/queue/failed/:id/retry", async (req, res) => {
    if (!requireScope(req, res, "admin")) return;
    const body = asObject(req.body) ?? {};
    const dryRun = Boolean(body.dryRun);
    const confirm = Boolean(body.confirm);
    const row = await getFailedDeliveryById(req.params.id);
    if (!row) {
      sendJson(res, 404, { ok: false, code: "NOT_FOUND", message: "Failed delivery not found" });
      return;
    }
    if (dryRun) {
      sendJson(res, 200, { ok: true, data: { status: "dry_run", entry: row } });
      return;
    }
    if (!confirm) {
      sendJson(res, 409, { ok: false, code: "RISK_CONFIRMATION_REQUIRED", message: "Failed queue retry requires confirm=true", requiredConfirmation: true });
      return;
    }
    const retryResult = await retryFailedDeliveryNow({ queueId: req.params.id, messaging: deps.messaging });
    sendJson(res, 200, { ok: true, data: retryResult });
  });
}
