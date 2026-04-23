import { Router } from "express";
import { runScribe } from "../../capabilities/scribe.js";
import { requireScope } from "../middleware/auth.js";
import { sendJson, asObject } from "../../utils.js";
import { RuntimeDeps } from "../../runtime.js";

export function registerScribeRoutes(router: Router, deps: RuntimeDeps) {
  router.post("/", async (req, res) => {
    if (!requireScope(req, res, "write")) return;
    const body = asObject(req.body);
    if (!body) {
      sendJson(res, 400, { ok: false, code: "VALIDATION_ERROR", message: "Request body must be a JSON object" });
      return;
    }
    try {
      const output = await runScribe({
        transcript: String(body.transcript ?? ""),
        patientId: String(body.patientId ?? ""),
        doctorId: String(body.doctorId ?? ""),
        aiClient: deps.aiClient
      });
      sendJson(res, 200, { ok: true, data: output });
    } catch (err: any) {
      if (err.message === "Transcript input is required") {
        sendJson(res, 422, { ok: false, code: "VALIDATION_ERROR", message: err.message });
      } else {
        throw err;
      }
    }
  });
}
