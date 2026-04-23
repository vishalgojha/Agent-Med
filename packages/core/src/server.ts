import express from "express";
import path from "path";
import fs from "node:fs";
import { runMigrations } from "./db/migrations.js";
import { createRuntimeDeps } from "./runtime.js";
import { logger } from "./logger.js";
import { getConfig } from "./config.js";
import { registerDoctorRoutes } from "./http/routes/doctors.js";
import { registerPatientRoutes } from "./http/routes/patients.js";
import { registerPriorAuthRoutes } from "./http/routes/priorAuth.js";
import { registerFollowUpRoutes } from "./http/routes/followUp.js";
import { registerDecideRoutes } from "./http/routes/decide.js";
import { registerReplayRoutes } from "./http/routes/replay.js";
import { registerOpsRoutes } from "./http/routes/ops.js";
import { registerScribeRoutes } from "./http/routes/scribe.js";
import { registerWebhookRoutes } from "./http/routes/webhooks.js";
import { requestLogger } from "./http/middleware/request-logger.js";
import { rateLimiter } from "./http/middleware/rate-limiter.js";
import { authenticate } from "./http/middleware/auth.js";

export function createServer(deps: any = createRuntimeDeps()) {
  const app = express();

  app.use(express.json({ limit: "2mb" }));
  app.use(requestLogger);
  app.use(authenticate);
  app.use(rateLimiter);

  // Routes

  const api = express.Router();

  const doctorsRouter = express.Router();
  registerDoctorRoutes(doctorsRouter);
  api.use("/doctors", doctorsRouter);

  const patientsRouter = express.Router();
  registerPatientRoutes(patientsRouter);
  api.use("/patients", patientsRouter);

  const priorAuthRouter = express.Router();
  registerPriorAuthRoutes(priorAuthRouter, deps);
  api.use("/prior-auth", priorAuthRouter);

  const followUpRouter = express.Router();
  registerFollowUpRoutes(followUpRouter, deps);
  api.use("/follow-up", followUpRouter);

  const decideRouter = express.Router();
  registerDecideRoutes(decideRouter, deps);
  api.use("/decide", decideRouter);

  const replayRouter = express.Router();
  registerReplayRoutes(replayRouter);
  api.use("/replay", replayRouter);

  const opsRouter = express.Router();
  registerOpsRoutes(opsRouter);
  api.use("/ops", opsRouter);

  const scribeRouter = express.Router();
  registerScribeRoutes(scribeRouter, deps);
  api.use("/scribe", scribeRouter);

  app.use("/api", api);

  const webhookRouter = express.Router();
  registerWebhookRoutes(webhookRouter);
  app.use("/webhooks", webhookRouter);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, data: { status: "ok" } });
  });

  app.get("/health/ready", (_req, res) => {
    res.json({ ok: true, data: { status: "ready" } });
  });

  const uiDistPath = path.resolve(process.cwd(), "ui", "dist");
  if (fs.existsSync(path.join(uiDistPath, "index.html"))) {
    app.use(express.static(uiDistPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/webhooks") || req.path.startsWith("/health")) {
        return next();
      }
      res.sendFile(path.join(uiDistPath, "index.html"));
    });
  }

  return app;
}

export function startServer(port?: number): void {
  runMigrations();
  const cfg = getConfig();
  const deps = createRuntimeDeps();
  const app = createServer(deps);
  const listenPort = port ?? cfg.port;

  app.listen(listenPort, () => {
    console.log(JSON.stringify({ ok: true, message: `doctor-agent listening on ${listenPort}` }));
  });
}
