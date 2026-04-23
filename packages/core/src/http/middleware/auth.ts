import { Request, Response, NextFunction } from "express";
import { getConfig } from "../../config.js";
import { appError } from "../../errors.js";
import { sendJson } from "../../utils.js";
import { TokenScope } from "../../types.js";

export function isTokenScope(value: unknown): value is TokenScope {
  return value === "read" || value === "write" || value === "admin";
}

export function requireScope(req: Request, res: Response, required: TokenScope): boolean {
  const tokenScope = isTokenScope(res.locals.authScope) ? res.locals.authScope : null;
  const rank: Record<TokenScope, number> = {
    read: 1,
    write: 2,
    admin: 3
  };
  if (!tokenScope || rank[tokenScope] < rank[required]) {
    sendJson(res, 403, appError("FORBIDDEN", `Requires scope '${required}'`));
    return false;
  }
  return true;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) return next();
  
  const { apiToken, apiTokenRead, apiTokenWrite, apiTokenAdmin } = getConfig();
  const anyTokenConfigured = apiToken !== "" || apiTokenRead !== "" || apiTokenWrite !== "" || apiTokenAdmin !== "";

  if (!anyTokenConfigured) {
    res.locals.authScope = "admin";
    return next();
  }

  const auth = req.header("authorization");
  if (!auth?.startsWith("Bearer ")) {
    sendJson(res, 401, appError("UNAUTHORIZED", "Missing or invalid API token"));
    return;
  }
  const token = auth.slice(7).trim();

  if (!token) {
    sendJson(res, 401, appError("UNAUTHORIZED", "Invalid API token"));
    return;
  }

  if (apiToken !== "" && apiToken === token) {
    res.locals.authScope = "admin";
  } else if (apiTokenAdmin !== "" && apiTokenAdmin === token) {
    res.locals.authScope = "admin";
  } else if (apiTokenWrite !== "" && apiTokenWrite === token) {
    res.locals.authScope = "write";
  } else if (apiTokenRead !== "" && apiTokenRead === token) {
    res.locals.authScope = "read";
  } else {
    sendJson(res, 401, appError("UNAUTHORIZED", "Invalid API token"));
    return;
  }
  next();
}
