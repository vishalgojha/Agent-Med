import { Router } from "express";
import { getReplayById, listReplay, pruneReplayOlderThan } from "../../engine/replay.js";
import { runMigrations } from "../../db/migrations.js";
import { print } from "../../utils.js";

export function registerReplayRoutes(router: Router) {
  router.get("/", (req, res) => {
    const limit = Number(req.query.limit ?? 20);
    res.json({ ok: true, data: listReplay(limit) });
  });

  router.get("/:id", (req, res) => {
    const row = getReplayById(req.params.id);
    if (!row) {
      res.status(404).json({ ok: false, code: "NOT_FOUND", message: "Replay row not found" });
      return;
    }
    res.json({ ok: true, data: row });
  });

  router.post("/prune", (req, res) => {
    const body = req.body;
    const days = Number(body.days ?? 30);
    if (!Number.isFinite(days) || days <= 0) {
      res.status(422).json({ ok: false, code: "VALIDATION_ERROR", message: "days must be a positive number" });
      return;
    }
    if (!Boolean(body.confirm)) {
      res.status(409).json({ ok: false, code: "RISK_CONFIRMATION_REQUIRED", message: "Replay pruning requires confirm=true", requiredConfirmation: true });
      return;
    }
    const deleted = pruneReplayOlderThan(days);
    res.json({ ok: true, data: { deleted, days } });
  });
}
