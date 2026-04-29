import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FhirClient } from "../fhir-client";
import { getFhirCtx, ok, err } from "./helpers";

export function registerGetObservations(server: McpServer) {
  server.registerTool(
    "get_observations",
    {
      description: "Retrieve patient observations (vital signs, labs, etc.) from the FHIR server",
      inputSchema: {
        patientId: z.string().describe("Patient ID (uses FHIR context if not provided)").optional(),
        category: z.enum(["vital-signs", "laboratory", "imaging", "survey", "exam"]).describe("Observation category").optional(),
        code: z.string().describe("LOINC or SNOMED code to filter by").optional(),
        date: z.string().describe("Date filter (e.g., ge2024-01-01)").optional(),
      },
    },
    async ({ patientId, category, code, date }, extra) => {
      const ctx = getFhirCtx(extra);
      if (!ctx?.patientId && !patientId) return err("Patient ID required in FHIR context or request.");

      const client = new FhirClient(patientId ? { ...ctx!, patientId } : ctx!);
      const params: Record<string, string> = { _sort: "-date", _count: "20" };
      if (category) params.category = category;
      if (code) params.code = code;
      if (date) params.date = date;

      const bundle = await client.searchByPatient("Observation", params);
      const entries = bundle.entry ?? [];
      if (entries.length === 0) return ok("No observations found.");

      const lines = entries.map((entry) => {
        const o = entry.resource as Record<string, unknown>;
        const oc = (o.code as Record<string, unknown> | undefined)?.coding as Array<Record<string, string>> | undefined;
        const name = oc?.[0]?.display ?? (o.code as Record<string, string> | undefined)?.text ?? "Unknown";
        const vq = o.valueQuantity as Record<string, number | string> | undefined;
        const value = vq ? `${vq.value} ${vq.unit ?? ""}` : JSON.stringify(o.valueString ?? "N/A");
        const effective = o.effectiveDateTime ?? "";
        return `- ${name}: ${value}${effective ? ` (${effective})` : ""}`;
      });

      return ok(`Observations (${bundle.total ?? entries.length}):\n${lines.join("\n")}`);
    }
  );
}
