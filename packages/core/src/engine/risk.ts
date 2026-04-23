import { Intent, RiskLevel, StructuredError } from "../types.js";

export function classifyRisk(intent: Intent): RiskLevel {
  return intent.risk;
}

export function checkRiskGate(intent: Intent, options: { confirm?: boolean }): true | StructuredError {
  const risk = classifyRisk(intent);

  if (risk === "LOW" || risk === "MEDIUM") {
    return true;
  }

  if (!options.confirm) {
    return {
      ok: false,
      blocked: true,
      code: "RISK_CONFIRMATION_REQUIRED",
      message: `${risk} risk action requires explicit confirmation`,
      requiredConfirmation: true,
      details: { risk }
    };
  }

  return true;
}

export async function criticalCountdown(risk: RiskLevel): Promise<void> {
  if (risk !== "CRITICAL") {
    return;
  }

  for (let i = 5; i > 0; i -= 1) {
    console.log(`WARNING: CRITICAL action starts in ${i}s`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
