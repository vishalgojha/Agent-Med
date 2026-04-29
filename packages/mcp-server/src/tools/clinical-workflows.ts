import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getFhirCtx, ok, err } from "./helpers";

const CORE_API_URL = process.env.CORE_API_URL || "http://localhost:3000";
const API_TOKEN = process.env.API_TOKEN || "";

export function registerScribe(server: McpServer) {
  server.registerTool(
    "scribe",
    {
      description: "Generate a SOAP note from a doctor-patient encounter transcript",
      inputSchema: {
        transcript: z.string().describe("The encounter transcript text"),
        patientId: z.string().describe("Patient ID (uses FHIR context if not provided)").optional(),
        doctorId: z.string().describe("Doctor ID"),
      },
    },
    async ({ transcript, patientId, doctorId }, extra) => {
      const ctx = getFhirCtx(extra);
      const effectivePatientId = patientId ?? ctx?.patientId;
      if (!effectivePatientId) return err("Patient ID required.");

      const res = await callCoreApi("/api/scribe", {
        transcript,
        patientId: effectivePatientId,
        doctorId,
        fhirUrl: ctx?.serverUrl,
        fhirToken: ctx?.accessToken,
      });

      return ok(`SOAP Note generated:\n${JSON.stringify(res, null, 2)}`);
    }
  );
}

export function registerPriorAuth(server: McpServer) {
  server.registerTool(
    "prior_auth",
    {
      description: "Create or manage prior authorization requests",
      inputSchema: {
        action: z.enum(["create", "status", "update"]).describe("Action to perform"),
        patientId: z.string().describe("Patient ID (uses FHIR context if not provided)").optional(),
        procedureCode: z.string().describe("CPT procedure code").optional(),
        diagnosisCodes: z.array(z.string()).describe("ICD-10 diagnosis codes").optional(),
        insurerId: z.string().describe("Insurer/payer ID").optional(),
        status: z.string().describe("Status update text").optional(),
      },
    },
    async ({ action, patientId, procedureCode, diagnosisCodes, insurerId, status }, extra) => {
      const ctx = getFhirCtx(extra);
      const effectivePatientId = patientId ?? ctx?.patientId;
      if (!effectivePatientId) return err("Patient ID required.");

      const path = action === "create" ? "/api/prior-auth" : "/api/prior-auth";
      const method = action === "create" ? "POST" : "PATCH";

      const res = await callCoreApi(path, {
        action,
        patientId: effectivePatientId,
        procedureCode,
        diagnosisCodes,
        insurerId,
        status,
        fhirUrl: ctx?.serverUrl,
        fhirToken: ctx?.accessToken,
      }, method);

      return ok(`Prior Auth (${action}):\n${JSON.stringify(res, null, 2)}`);
    }
  );
}

export function registerFollowUp(server: McpServer) {
  server.registerTool(
    "follow_up",
    {
      description: "Schedule or manage patient follow-up communications",
      inputSchema: {
        action: z.enum(["schedule", "retry", "dispatch"]).describe("Action to perform"),
        patientId: z.string().describe("Patient ID (uses FHIR context if not provided)").optional(),
        body: z.string().describe("Message body text").optional(),
        channel: z.enum(["sms", "whatsapp"]).describe("Communication channel").optional(),
        followUpId: z.string().describe("Follow-up ID for retry").optional(),
        confirm: z.boolean().describe("Explicit confirmation for high-risk actions").optional(),
      },
    },
    async ({ action, patientId, body, channel, followUpId, confirm }, extra) => {
      const ctx = getFhirCtx(extra);
      const effectivePatientId = patientId ?? ctx?.patientId;
      if (!effectivePatientId) return err("Patient ID required.");

      let path = "/api/follow-up";
      if (action === "retry" && followUpId) path = `/api/follow-up/${followUpId}/retry`;
      else if (action === "dispatch") path = "/api/follow-up/dispatch";

      const res = await callCoreApi(path, {
        action,
        patientId: effectivePatientId,
        body: body ?? "Please contact your care team for follow-up.",
        channel: channel ?? "sms",
        confirm: confirm ?? false,
        fhirUrl: ctx?.serverUrl,
        fhirToken: ctx?.accessToken,
      });

      return ok(`Follow-up (${action}):\n${JSON.stringify(res, null, 2)}`);
    }
  );
}

export function registerDecision(server: McpServer) {
  server.registerTool(
    "clinical_decision",
    {
      description: "Get clinical decision support alerts and recommendations for a patient",
      inputSchema: {
        patientId: z.string().describe("Patient ID (uses FHIR context if not provided)").optional(),
        medications: z.array(z.string()).describe("Current medications to check").optional(),
        conditions: z.array(z.string()).describe("Current conditions to check").optional(),
        query: z.string().describe("Free-text clinical question").optional(),
      },
    },
    async ({ patientId, medications, conditions, query }, extra) => {
      const ctx = getFhirCtx(extra);
      const effectivePatientId = patientId ?? ctx?.patientId;
      if (!effectivePatientId) return err("Patient ID required.");

      const res = await callCoreApi("/api/decide", {
        patientId: effectivePatientId,
        medications: medications ?? [],
        conditions: conditions ?? [],
        query,
        fhirUrl: ctx?.serverUrl,
        fhirToken: ctx?.accessToken,
      });

      return ok(`Clinical Decision Support:\n${JSON.stringify(res, null, 2)}\n\nClinical Disclaimer: This is AI-generated decision support and must be reviewed by a licensed clinician.`);
    }
  );
}

async function callCoreApi(path: string, body: Record<string, unknown>, method = "POST") {
  const res = await fetch(`${CORE_API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: method !== "GET" ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`Core API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
