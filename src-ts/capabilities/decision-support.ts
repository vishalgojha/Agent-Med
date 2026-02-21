import { AIClient } from "../ai/client.js";
import { loadPrompt } from "../ai/prompts.js";
import { getPatientById } from "../patients/store.js";
import { ClinicalAlert } from "../types.js";

const DISCLAIMER =
  "This is decision support, not medical advice. Verify with current clinical references.";

export async function runDecisionSupport(input: {
  aiClient: AIClient;
  patientId?: string;
  meds?: string[];
  allergies?: string[];
  age?: number;
  weight?: number;
  query: string;
}): Promise<ClinicalAlert[]> {
  const patient = input.patientId ? getPatientById(input.patientId) : null;

  const payload = {
    query: input.query,
    age: input.age,
    weight: input.weight,
    meds: input.meds ?? patient?.meds ?? [],
    allergies: input.allergies ?? patient?.allergies ?? []
  };

  const schema = JSON.stringify(
    {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          severity: { type: "string" },
          message: { type: "string" },
          sources: { type: "array", items: { type: "string" } }
        },
        required: ["type", "severity", "message", "sources"]
      }
    },
    null,
    2
  );

  const alerts = await input.aiClient.completeStructured<ClinicalAlert[]>(
    loadPrompt("decision"),
    JSON.stringify(payload),
    schema
  );

  const sorted = alerts.sort((a, b) => {
    const rank = (severity?: string): number => {
      if (severity === "critical") return 0;
      if (severity === "warn") return 1;
      return 2;
    };
    return rank(a.severity) - rank(b.severity);
  });

  sorted.push({ type: "disclaimer", message: DISCLAIMER });
  return sorted;
}
