import { Router } from "express";
import { getOpsMetrics } from "../../ops/metrics.js";
import { getFollowUpQueueStats } from "../../capabilities/follow-up.js";
import { requireScope } from "../middleware/auth.js";

export function registerOpsRoutes(router: Router) {
  router.get("/metrics", (req, res) => {
    if (!requireScope(req, res, "admin")) return;
    res.json({
      ok: true,
      data: {
        ...getOpsMetrics(),
        queue: getFollowUpQueueStats()
      }
    });
  });
}
