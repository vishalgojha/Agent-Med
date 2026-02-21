import { CapabilityName, Intent, RiskLevel } from "../types.js";
import { makeId, nowIso } from "../utils.js";

export function createIntent(input: {
  capability: CapabilityName;
  doctorId: string;
  patientId?: string;
  payload: Record<string, unknown>;
  risk: RiskLevel;
  dryRun: boolean;
}): Intent {
  return {
    id: makeId("intent"),
    capability: input.capability,
    doctorId: input.doctorId,
    patientId: input.patientId,
    payload: input.payload,
    risk: input.risk,
    dryRun: input.dryRun,
    createdAt: nowIso()
  };
}
