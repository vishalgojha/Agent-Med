import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FhirClient } from "../fhir-client";
import { getFhirCtx, ok, err } from "./helpers";

export function registerGetMedications(server: McpServer) {
  server.registerTool(
    "get_medications",
    {
      description: "Retrieve a patient's medication list from the FHIR server",
      inputSchema: {
        patientId: z.string().describe("Patient ID (uses FHIR context if not provided)").optional(),
        status: z.enum(["active", "completed", "stopped", "intended"]).describe("Filter by status").optional(),
      },
    },
    async ({ patientId, status }, extra) => {
      const ctx = getFhirCtx(extra);
      if (!ctx?.patientId && !patientId) return err("Patient ID required in FHIR context or request.");

      const client = new FhirClient(patientId ? { ...ctx!, patientId } : ctx!);
      const params: Record<string, string> = {};
      if (status) params.status = status;
      const bundle = await client.searchByPatient("MedicationRequest", params);

      const entries = bundle.entry ?? [];
      if (entries.length === 0) return ok("No medication requests found.");

      const lines = entries.map((entry) => {
        const m = entry.resource as Record<string, unknown>;
        const med = (m.medicationCodeableConcept as Record<string, unknown> | undefined)?.coding as Array<Record<string, string>> | undefined;
        const name = med?.[0]?.display ?? (m.medicationReference as Record<string, string> | undefined)?.display ?? "Unknown medication";
        const s = m.status ?? "unknown";
        const dosage = ((m.dosageInstruction as Array<Record<string, string>> | undefined)?.[0]?.text) ?? "";
        return `- ${name} [${s}]${dosage ? ` — ${dosage}` : ""}`;
      });

      return ok(`Medication Requests (${bundle.total ?? entries.length}):\n${lines.join("\n")}`);
    }
  );
}
