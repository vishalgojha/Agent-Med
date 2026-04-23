import { ActionResult, CapabilityName, Intent, StructuredError } from "../types.js";
import { nowIso } from "../utils.js";
import { checkRiskGate, classifyRisk, criticalCountdown } from "./risk.js";
import { appendReplayLog } from "./replay.js";

export type CapabilityHandler = (intent: Intent) => Promise<unknown>;

export interface ExecuteOptions {
  confirm?: boolean;
  requestId?: string;
  actorId?: string;
}

export async function executeIntent(
  intent: Intent,
  handlers: Record<CapabilityName, CapabilityHandler>,
  options: ExecuteOptions = {}
): Promise<ActionResult | StructuredError> {
  const risk = classifyRisk(intent);
  const gate = checkRiskGate(intent, options);
  if (gate !== true) {
    return gate;
  }

  await criticalCountdown(risk);

  const startedAt = Date.now();
  const executedAt = nowIso();

  try {
    const handler = handlers[intent.capability];
    const output = await handler(intent);

    const result: ActionResult = {
      ok: true,
      intentId: intent.id,
      capability: intent.capability,
      risk,
      output,
      requestId: options.requestId,
      actorId: options.actorId,
      executedAt,
      durationMs: Date.now() - startedAt
    };

    appendReplayLog(result);
    return result;
  } catch (error) {
    return {
      ok: false,
      code: "EXECUTION_FAILED",
      message: error instanceof Error ? error.message : "Execution failed",
      details: {
        intentId: intent.id,
        capability: intent.capability,
        risk
      }
    };
  }
}
