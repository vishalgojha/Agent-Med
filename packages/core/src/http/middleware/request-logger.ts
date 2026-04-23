import { Request, Response, NextFunction } from "express";
import { logger } from "../../logger.js";
import { randomUUID } from "node:crypto";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startedAt = Date.now();
  const requestId = req.header("x-request-id") ?? randomUUID();
  const actorId = req.header("x-actor-id") ?? "system";
  req.headers["x-request-id"] = requestId;
  req.headers["x-actor-id"] = actorId;
  res.setHeader("x-request-id", requestId);
  logger.info("request.received", { requestId, actorId, method: req.method, path: req.path });
  res.on("finish", () => {
    logger.info("request.completed", {
      requestId,
      actorId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });
  next();
}
