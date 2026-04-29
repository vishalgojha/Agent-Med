import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FhirClient } from "../fhir-client";
import { getFhirCtx, ok, err } from "./helpers";

export function registerGetConditions(server: McpServer) {
  server.registerTool(
    "get_conditions",
    {
      description: "Retrieve a patient's active and historical conditions from the FHIR server",
      inputSchema: {
        patientId: z.string().describe("Patient ID (uses FHIR context if not provided)").optional(),
        clinicalStatus: z.enum(["active", "recurrence", "relapse", "inactive", "remission", "resolved"]).describe("Filter by clinical status").optional(),
      },
    },
    async ({ patientId, clinicalStatus }, extra) => {
      const ctx = getFhirCtx(extra);
      if (!ctx?.patientId && !patientId) return err("Patient ID required in FHIR context or request.");

      const client = new FhirClient(patientId ? { ...ctx!, patientId } : ctx!);
      const bundle = await client.searchByPatient("Condition");

      const entries = bundle.entry ?? [];
      if (entries.length === 0) return ok("No conditions found.");

      const conditions = entries.map((entry) => {
        const c = entry.resource as Record<string, unknown>;
        const code = (c.code as Record<string, unknown> | undefined)?.coding as Array<Record<string, string>> | undefined;
        return {
          name: code?.[0]?.display ?? "Unknown",
          status: ((c.clinicalStatus as Record<string, unknown> | undefined)?.coding as Array<Record<string, string>> | undefined)?.[0]?.code ?? "unknown",
          onset: c.onsetDateTime ?? "",
        };
      });

      const filtered = clinicalStatus ? conditions.filter((c) => c.status === clinicalStatus) : conditions;
      const active = filtered.filter((c) => c.status === "active");
      const resolved = filtered.filter((c) => c.status === "resolved");
      const other = filtered.filter((c) => !["active", "resolved"].includes(c.status));

      const lines: string[] = [];
      if (active.length) { lines.push("Active:"); active.forEach((c) => lines.push(`  - ${c.name}${c.onset ? ` (onset: ${c.onset})` : ""}`)); }
      if (resolved.length) { lines.push("Resolved:"); resolved.forEach((c) => lines.push(`  - ${c.name}`)); }
      if (other.length) { lines.push("Other:"); other.forEach((c) => lines.push(`  - ${c.name} [${c.status}]`)); }

      return ok(`Conditions (${filtered.length} of ${conditions.length} total):\n${lines.join("\n")}`);
    }
  );
}
