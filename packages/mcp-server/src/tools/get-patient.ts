import { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FhirClient } from "../fhir-client";
import { FhirContext } from "../fhir-context";
import { CallToolResult, RequestInfo } from "@modelcontextprotocol/sdk/types.js";
import { getFhirCtx, ok, err } from "./helpers";

function formatPatient(resource: Record<string, unknown>): string {
  const names = resource.name as Array<Record<string, unknown>> | undefined;
  const name = names?.[0];
  const givenArr = name?.given as string[] | undefined;
  const given = Array.isArray(givenArr) ? givenArr.join(" ") : (typeof givenArr === "string" ? givenArr : "");
  const family = (name?.family as string) ?? "";
  const dob = (resource.birthDate as string) ?? "unknown";
  const gender = (resource.gender as string) ?? "unknown";
  const id = (resource.id as string) ?? "unknown";
  return `Patient ID: ${id}\nName: ${given} ${family}\nDOB: ${dob}\nGender: ${gender}`;
}

export function registerGetPatient(server: McpServer) {
  server.registerTool(
    "get_patient",
    {
      description: "Retrieve a patient record from the FHIR server by ID or search by name",
      inputSchema: {
        patientId: z.string().describe("The FHIR Patient resource ID").optional(),
        firstName: z.string().describe("First name for patient search").optional(),
        lastName: z.string().describe("Last name for patient search").optional(),
      },
    },
    async ({ patientId, firstName, lastName }, extra) => {
      const ctx = getFhirCtx(extra);
      if (!ctx) return err("FHIR context is required. Provide x-fhir-server-url header.");

      const client = new FhirClient(ctx);

      if (patientId) {
        const patient = await client.read("Patient", patientId);
        return patient ? ok(formatPatient(patient)) : err(`Patient ${patientId} not found`);
      }

      if (firstName || lastName) {
        const params: Record<string, string> = {};
        if (firstName) params.given = firstName;
        if (lastName) params.family = lastName;
        const bundle = await client.search("Patient", params);
        const count = bundle.total ?? bundle.entry?.length ?? 0;
        if (count === 0) return err("No patients found matching the search criteria.");
        const entries = (bundle.entry ?? []).slice(0, 5).map((e) => formatPatient(e.resource!)).join("\n---\n");
        return ok(`Found ${count} patient(s):\n${entries}`);
      }

      if (ctx.patientId) {
        const patient = await client.read("Patient", ctx.patientId);
        return patient ? ok(formatPatient(patient)) : err("No patient record found for current context.");
      }

      return err("Provide a patientId, search name, or ensure FHIR context includes a patient ID.");
    }
  );
}

export function registerGetPatientSummary(server: McpServer) {
  server.registerTool(
    "get_patient_summary",
    {
      description: "Get a comprehensive patient summary including demographics, conditions, medications, vitals, and encounters",
      inputSchema: {
        patientId: z.string().describe("Override patient ID (uses FHIR context patient if not provided)").optional(),
      },
    },
    async ({ patientId }, extra) => {
      const ctx = getFhirCtx(extra);
      if (!ctx) return err("FHIR context is required.");

      const effectiveCtx: FhirContext = patientId ? { ...ctx, patientId } : ctx;
      if (!effectiveCtx.patientId) return err("No patient ID in context or request.");

      const client = new FhirClient(effectiveCtx);
      const { patient, conditions, medications, observations, encounters } = await client.getPatientSummary();

      const lines: string[] = [];
      if (patient) lines.push(formatPatient(patient));

      const condCount = conditions.total ?? conditions.entry?.length ?? 0;
      lines.push(`\nConditions (${condCount}):`);
      for (const entry of conditions.entry?.slice(0, 10) ?? []) {
        const c = entry.resource as Record<string, unknown>;
        const coding = (c.code as Record<string, unknown> | undefined)?.coding;
        const codeArr = Array.isArray(coding) ? coding : [];
        const codeDisplay = codeArr.length > 0 ? (codeArr[0] as Record<string, string>).display : undefined;
        const statusCoding = (c.clinicalStatus as Record<string, unknown> | undefined)?.coding;
        const statusArr = Array.isArray(statusCoding) ? statusCoding : [];
        const statusCode = statusArr.length > 0 ? (statusArr[0] as Record<string, string>).code : undefined;
        lines.push(`  - ${codeDisplay ?? JSON.stringify(c.code)} (${statusCode ?? "active"})`);
      }

      const medCount = medications.total ?? medications.entry?.length ?? 0;
      lines.push(`\nMedications (${medCount}):`);
      for (const entry of medications.entry?.slice(0, 10) ?? []) {
        const m = entry.resource as Record<string, unknown>;
        const med = (m.medicationCodeableConcept as Record<string, unknown> | undefined)?.coding as Array<Record<string, string>> | undefined;
        lines.push(`  - ${med?.[0]?.display ?? JSON.stringify(m.medicationCodeableConcept ?? m.medicationReference)} (${m.status ?? "active"})`);
      }

      const obsCount = observations.total ?? observations.entry?.length ?? 0;
      lines.push(`\nVital Signs (${obsCount}):`);
      for (const entry of observations.entry?.slice(0, 10) ?? []) {
        const o = entry.resource as Record<string, unknown>;
        const vq = o.valueQuantity as Record<string, number | string> | undefined;
        const val = vq ? `${vq.value} ${vq.unit ?? ""}` : JSON.stringify(o.valueString ?? "N/A");
        lines.push(`  - ${(o.code as Record<string, unknown> | undefined)?.text ?? "Unknown"}: ${val}`);
      }

      const encCount = encounters.total ?? encounters.entry?.length ?? 0;
      lines.push(`\nEncounters (${encCount}):`);
      for (const entry of encounters.entry?.slice(0, 5) ?? []) {
        const e = entry.resource as Record<string, unknown>;
        lines.push(`  - ${(e.class as Record<string, string> | undefined)?.code ?? "unknown"} (${e.status ?? "unknown"})`);
      }

      return ok(lines.join("\n"));
    }
  );
}
