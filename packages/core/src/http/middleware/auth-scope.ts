import { Request, Response, NextFunction } from "express";
import { requireScope } from "./auth.js";
import { sendJson } from "../../utils.js";
import { appError } from "../../errors.js";

export function authScopeMiddleware(required: "read" | "write" | "admin") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (requireScope(req, res, required)) {
      next();
    }
  };
}
