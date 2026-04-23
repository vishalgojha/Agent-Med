import { Router } from "express";
import { addDoctor, getDoctorById, listDoctors } from "../../doctors/store.js";
import { requireScope } from "../middleware/auth.js";
import { sendJson } from "../../utils.js";
import { asObject, requireString, parseSpecialty } from "../../utils.js";

export function registerDoctorRoutes(router: Router) {
  router.get("/", (req, res) => {
    if (!requireScope(req, res, "read")) return;
    sendJson(res, 200, { ok: true, data: listDoctors() });
  });

  router.post("/", (req, res) => {
    if (!requireScope(req, res, "write")) return;
    const body = asObject(req.body);
    if (!body) {
      sendJson(res, 400, { ok: false, code: "VALIDATION_ERROR", message: "Request body must be a JSON object" });
      return;
    }
    const name = requireString(body, "name");
    const specialty = parseSpecialty(String(body.specialty ?? "general"));
    if (!name) {
      sendJson(res, 422, { ok: false, code: "VALIDATION_ERROR", message: "name is required" });
      return;
    }
    sendJson(res, 201, { ok: true, data: addDoctor({ name, specialty }) });
  });

  router.get("/:id", (req, res) => {
    if (!requireScope(req, res, "read")) return;
    const doctor = getDoctorById(req.params.id);
    if (!doctor) {
      sendJson(res, 404, { ok: false, code: "NOT_FOUND", message: "Doctor not found" });
      return;
    }
    sendJson(res, 200, { ok: true, data: doctor });
  });
}
