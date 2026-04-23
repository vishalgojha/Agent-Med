import { Router } from "express";
import { runDecisionSupport } from "../../capabilities/decision-support.js";
import { runMigrations } from "../../db/migrations.js";
import { print } from "../../utils.js";
import { RuntimeDeps } from "../../runtime.js";

export function registerDecideRoutes(router: Router, deps: RuntimeDeps) {
  router.post("/", async (req, res) => {
    const body = req.body;
    const output = await runDecisionSupport({
      aiClient: deps.aiClient,
      patientId: body.patientId,
      meds: (body.meds ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
      allergies: (body.allergies ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
      age: body.age ? Number(body.age) : undefined,
      weight: body.weight ? Number(body.weight) : undefined,
      query: body.query
    });
    res.json({ ok: true, data: output });
  });
}
