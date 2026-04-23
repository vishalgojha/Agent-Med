import { Router } from "express";
import { addPatient, getPatientById, listPatients } from "../../patients/store.js";
import { getDoctorById } from "../../doctors/store.js";
import { requireScope } from "../middleware/auth.js";
import { sendJson } from "../../utils.js";
import { asObject, requireString } from "../../utils.js";

export function registerPatientRoutes(router: Router) {
  router.get("/", (req, res) => {
    if (!requireScope(req, res, "read")) return;
    const doctorId = typeof req.query.doctorId === "string" ? req.query.doctorId : undefined;
    const rows = listPatients();
    sendJson(res, 200, { ok: true, data: doctorId ? rows.filter((row) => row.doctorId === doctorId) : rows });
  });

  router.post("/", (req, res) => {
    if (!requireScope(req, res, "write")) return;
    const body = asObject(req.body);
    if (!body) {
      sendJson(res, 400, { ok: false, code: "VALIDATION_ERROR", message: "Request body must be a JSON object" });
      return;
    }
    const doctorId = requireString(body, "doctorId");
    const name = requireString(body, "name");
    if (!doctorId) {
      sendJson(res, 422, { ok: false, code: "VALIDATION_ERROR", message: "doctorId is required" });
      return;
    }
    if (!name) {
      sendJson(res, 422, { ok: false, code: "VALIDATION_ERROR", message: "name is required" });
      return;
    }
    if (!getDoctorById(doctorId)) {
      sendJson(res, 404, { ok: false, code: "NOT_FOUND", message: "Doctor not found" });
      return;
    }
    const dob = typeof body.dob === "string" ? body.dob : undefined;
    const phone = typeof body.phone === "string" ? body.phone : undefined;
    const meds = Array.isArray(body.meds) ? body.meds.filter((v): v is string => typeof v === "string") : undefined;
    const allergies = Array.isArray(body.allergies)
      ? body.allergies.filter((v): v is string => typeof v === "string")
      : undefined;
    const patient = addPatient({ doctorId, name, dob, phone, meds, allergies });
    sendJson(res, 201, { ok: true, data: patient });
  });

  router.get("/:id", (req, res) => {
    if (!requireScope(req, res, "read")) return;
    const patient = getPatientById(req.params.id);
    if (!patient) {
      sendJson(res, 404, { ok: false, code: "NOT_FOUND", message: "Patient not found" });
      return;
    }
    sendJson(res, 200, { ok: true, data: patient });
  });
}
