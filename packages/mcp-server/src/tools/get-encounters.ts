import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FhirClient } from "../fhir-client";
import { getFhirCtx, ok, err } from "./helpers";

export function registerGetEncounters(server: McpServer) {
  server.registerTool(
    "get_encounters",
    {
      description: "Retrieve a patient's encounter history from the FHIR server",
      inputSchema: {
        patientId: z.string().describe("Patient ID (uses FHIR context if not provided)").optional(),
        status: z.enum(["planned", "arrived", "triaged", "in-progress", "onleave", "finished", "cancelled"]).describe("Filter by status").optional(),
      },
    },
    async ({ patientId, status }, extra) => {
      const ctx = getFhirCtx(extra);
      if (!ctx?.patientId && !patientId) return err("Patient ID required in FHIR context or request.");

      const client = new FhirClient(patientId ? { ...ctx!, patientId } : ctx!);
      const params: Record<string, string> = { _sort: "-date", _count: "20" };
      if (status) params.status = status;

      const bundle = await client.searchByPatient("Encounter", params);
      const entries = bundle.entry ?? [];
      if (entries.length === 0) return ok("No encounters found.");

      const lines = entries.map((entry) => {
        const e = entry.resource as Record<string, unknown>;
        const classCode = (e.class as Record<string, string> | undefined)?.code ?? "unknown";
        const s = e.status ?? "unknown";
        const period = e.period as Record<string, string> | undefined;
        const dates = period ? `${period.start ?? "?"} to ${period.end ?? "present"}` : "no dates";
        return `- ${classCode} [${s}] ${dates}`;
      });

      return ok(`Encounters (${bundle.total ?? entries.length}):\n${lines.join("\n")}`);
    }
  );
}
