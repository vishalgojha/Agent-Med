import { Request, Response } from "express";
import { createIntent } from "../engine/intent.js";
import { executeIntent } from "../engine/executor.js";
import { appError, toStructuredError } from "../errors.js";
import { createCapabilityHandlers, createRuntimeDeps, RuntimeDeps } from "../runtime.js";
import { CapabilityName, RiskLevel } from "../types.js";
import { asObject, requireString, requireStringArray, sendJson } from "../utils.js";

function riskForRequest(capability: CapabilityName, body: Record<string, unknown>): RiskLevel {
  if (capability === "prior_auth" && body.submit === true) return "HIGH";
  if (capability === "follow_up" && body.sendNow === true) return "HIGH";
  return capability === "scribe" || capability === "decision_support" ? "LOW" : "MEDIUM";
}

function validateCapabilityPayload(
  capability: CapabilityName,
  body: Record<string, unknown>
): { ok: true } | { ok: false; error: ReturnType<typeof appError> } {
  if (capability === "scribe") {
    if (!requireString(body, "transcript")) {
      return { ok: false, error: appError("VALIDATION_ERROR", "transcript is required") };
    }
    if (!requireString(body, "patientId")) {
      return { ok: false, error: appError("VALIDATION_ERROR", "patientId is required") };
    }
    if (!requireString(body, "doctorId")) {
      return { ok: false, error: appError("VALIDATION_ERROR", "doctorId is required") };
    }
    return { ok: true };
  }

  if (capability === "prior_auth") {
    if (!requireString(body, "patientId")) return { ok: false, error: appError("VALIDATION_ERROR", "patientId is required") };
    if (!requireString(body, "doctorId")) return { ok: false, error: appError("VALIDATION_ERROR", "doctorId is required") };
    if (!requireString(body, "procedureCode")) return { ok: false, error: appError("VALIDATION_ERROR", "procedureCode is required") };
    if (!requireString(body, "insurerId")) return { ok: false, error: appError("VALIDATION_ERROR", "insurerId is required") };
    if (!requireStringArray(body, "diagnosisCodes")) {
      return { ok: false, error: appError("VALIDATION_ERROR", "diagnosisCodes must be a string[]") };
    }
    return { ok: true };
  }

  if (capability === "follow_up") {
    if (!requireString(body, "patientId")) return { ok: false, error: appError("VALIDATION_ERROR", "patientId is required") };
    if (!requireString(body, "doctorId")) return { ok: false, error: appError("VALIDATION_ERROR", "doctorId is required") };
    const trigger = requireString(body, "trigger");
    if (!trigger) return { ok: false, error: appError("VALIDATION_ERROR", "trigger is required") };
    if (!["post_visit", "lab_result", "medication_reminder", "custom"].includes(trigger)) {
      return { ok: false, error: appError("VALIDATION_ERROR", "trigger must be one of post_visit|lab_result|medication_reminder|custom") };
    }
    const channel = body.channel;
    if (channel !== undefined && channel !== "sms" && channel !== "whatsapp") {
      return { ok: false, error: appError("VALIDATION_ERROR", "channel must be sms or whatsapp") };
    }
    return { ok: true };
  }

  if (capability === "decision_support") {
    if (!requireString(body, "query")) return { ok: false, error: appError("VALIDATION_ERROR", "query is required") };
    return { ok: true };
  }

  return { ok: true };
}

export async function handleCapability(
  req: Request,
  res: Response,
  capability: CapabilityName,
  deps: RuntimeDeps
): Promise<void> {
  try {
    const body = asObject(req.body);
    if (!body) {
      sendJson(res, 400, appError("VALIDATION_ERROR", "Request body must be a JSON object"));
      return;
    }
    const validation = validateCapabilityPayload(capability, body);
    if (!validation.ok) {
      sendJson(res, 422, validation.error);
      return;
    }

    const intent = createIntent({
      capability,
      doctorId: String(body.doctorId ?? "d_api"),
      patientId: body.patientId ? String(body.patientId) : undefined,
      payload: body,
      risk: riskForRequest(capability, body),
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
  } catch (error) {
    sendJson(res, 500, toStructuredError(error));
  }
}
