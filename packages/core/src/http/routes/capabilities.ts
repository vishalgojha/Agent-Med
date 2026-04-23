import { Router } from "express";
import { handleCapability } from "../capabilities.js";
import { CapabilityName } from "../../types.js";
import { RuntimeDeps } from "../../runtime.js";

export function registerCapabilityRoutes(router: Router, deps: RuntimeDeps) {
  router.post("/scribe", async (req, res) => {
    await handleCapability(req, res, "scribe", deps);
  });
  router.post("/prior-auth", async (req, res) => {
    await handleCapability(req, res, "prior_auth", deps);
  });
  router.post("/follow-up", async (req, res) => {
    await handleCapability(req, res, "follow_up", deps);
  });
  router.post("/decide", async (req, res) => {
    await handleCapability(req, res, "decision_support", deps);
  });
}
