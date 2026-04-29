import { McpClient, ToolResult } from "./mcp-client";
import { FhirContextMetadata, toSharpHeaders } from "./fhir-context";

export interface SessionState {
  fhirContext?: FhirContextMetadata;
  conversationHistory: Array<{ role: "user" | "agent"; content: string; timestamp: number }>;
  taskResults: Array<{ tool: string; result: string }>;
  patientId?: string;
}

export const SESSIONS = new Map<string, SessionState>();

export function getOrCreateSession(sessionId: string): SessionState {
  let session = SESSIONS.get(sessionId);
  if (!session) {
    session = {
      conversationHistory: [],
      taskResults: [],
    };
    SESSIONS.set(sessionId, session);
  }
  return session;
}

export interface WorkflowStep {
  tool: string;
  args: Record<string, unknown>;
  description: string;
}

export interface WorkflowPlan {
  steps: WorkflowStep[];
  summary: string;
  requiresConfirmation: boolean;
}

const TOOL_ROUTING: Record<string, (message: string, session: SessionState) => WorkflowPlan | null> = {
  "patient_lookup": (message, session) => {
    const lower = message.toLowerCase();
    if (lower.includes("patient") && (lower.includes("find") || lower.includes("search") || lower.includes("summary") || lower.includes("record"))) {
      return {
        steps: [
          {
            tool: "get_patient_summary",
            args: { patientId: session.patientId ?? session.fhirContext?.patientId },
            description: "Retrieve complete patient summary",
          },
        ],
        summary: "Looking up patient record and summary",
        requiresConfirmation: false,
      };
    }
    return null;
  },

  "medications": (message, session) => {
    const lower = message.toLowerCase();
    if (lower.includes("medication") || lower.includes("prescription") || lower.includes("drug") || lower.includes("med ")) {
      return {
        steps: [
          {
            tool: "get_medications",
            args: { patientId: session.patientId ?? session.fhirContext?.patientId },
            description: "Retrieve patient medication list",
          },
        ],
        summary: "Retrieving patient medications",
        requiresConfirmation: false,
      };
    }
    return null;
  },

  "conditions": (message, session) => {
    const lower = message.toLowerCase();
    if (lower.includes("condition") || lower.includes("diagnosis") || lower.includes("problem list")) {
      return {
        steps: [
          {
            tool: "get_conditions",
            args: { patientId: session.patientId ?? session.fhirContext?.patientId },
            description: "Retrieve patient conditions",
          },
        ],
        summary: "Retrieving patient conditions",
        requiresConfirmation: false,
      };
    }
    return null;
  },

  "observations": (message, session) => {
    const lower = message.toLowerCase();
    if (lower.includes("vital") || lower.includes("lab") || lower.includes("observation") || lower.includes("blood pressure") || lower.includes("a1c")) {
      return {
        steps: [
          {
            tool: "get_observations",
            args: { patientId: session.patientId ?? session.fhirContext?.patientId },
            description: "Retrieve patient observations",
          },
        ],
        summary: "Retrieving patient observations",
        requiresConfirmation: false,
      };
    }
    return null;
  },

  "encounters": (message, session) => {
    const lower = message.toLowerCase();
    if (lower.includes("encounter") || lower.includes("visit") || lower.includes("appointment history")) {
      return {
        steps: [
          {
            tool: "get_encounters",
            args: { patientId: session.patientId ?? session.fhirContext?.patientId },
            description: "Retrieve patient encounter history",
          },
        ],
        summary: "Retrieving patient encounters",
        requiresConfirmation: false,
      };
    }
    return null;
  },

  "scribe": (message, session) => {
    const lower = message.toLowerCase();
    if (lower.includes("transcript") && (lower.includes("soap") || lower.includes("note") || lower.includes("scribe"))) {
      const transcriptMatch = message.match(/transcript[:\s]+([\s\S]+)/i);
      return {
        steps: [
          {
            tool: "scribe",
            args: {
              transcript: transcriptMatch?.[1] ?? message,
              patientId: session.patientId ?? session.fhirContext?.patientId,
              doctorId: "d_default",
            },
            description: "Generate SOAP note from transcript",
          },
        ],
        summary: "Generating SOAP note",
        requiresConfirmation: false,
      };
    }
    return null;
  },

  "prior_auth": (message, session) => {
    const lower = message.toLowerCase();
    if (lower.includes("prior auth") || lower.includes("authorization") || lower.includes("pre-auth")) {
      return {
        steps: [
          {
            tool: "get_patient_summary",
            args: { patientId: session.patientId ?? session.fhirContext?.patientId },
            description: "Get patient context for prior auth",
          },
          {
            tool: "prior_auth",
            args: {
              action: "create",
              patientId: session.patientId ?? session.fhirContext?.patientId,
            },
            description: "Create prior authorization request",
          },
        ],
        summary: "Processing prior authorization",
        requiresConfirmation: true,
      };
    }
    return null;
  },

  "follow_up": (message, session) => {
    const lower = message.toLowerCase();
    if (lower.includes("follow up") || lower.includes("follow-up") || lower.includes("schedule")) {
      return {
        steps: [
          {
            tool: "follow_up",
            args: {
              action: "schedule",
              patientId: session.patientId ?? session.fhirContext?.patientId,
              body: "Please contact your care team for follow-up.",
              channel: "sms",
            },
            description: "Schedule patient follow-up",
          },
        ],
        summary: "Scheduling follow-up communication",
        requiresConfirmation: true,
      };
    }
    return null;
  },

  "decision_support": (message, session) => {
    const lower = message.toLowerCase();
    if (lower.includes("decision") || lower.includes("recommend") || lower.includes("safe to") || lower.includes("should i")) {
      return {
        steps: [
          {
            tool: "get_medications",
            args: { patientId: session.patientId ?? session.fhirContext?.patientId },
            description: "Get current medications for decision context",
          },
          {
            tool: "clinical_decision",
            args: {
              patientId: session.patientId ?? session.fhirContext?.patientId,
              query: message,
            },
            description: "Get clinical decision support",
          },
        ],
        summary: "Running clinical decision support analysis",
        requiresConfirmation: false,
      };
    }
    return null;
  },
};

export function planWorkflow(
  message: string,
  session: SessionState
): WorkflowPlan {
  for (const [, router] of Object.entries(TOOL_ROUTING)) {
    const plan = router(message, session);
    if (plan) return plan;
  }

  return {
    steps: [
      {
        tool: "get_patient_summary",
        args: { patientId: session.patientId ?? session.fhirContext?.patientId },
        description: "Get patient context to better understand the request",
      },
    ],
    summary: "Retrieving patient context for general inquiry",
    requiresConfirmation: false,
  };
}

export async function executeWorkflow(
  plan: WorkflowPlan,
  session: SessionState
): Promise<string> {
  const mcpUrl = process.env.MCP_SERVER_URL || "http://localhost:3002";
  const mcpClient = new McpClient(mcpUrl, process.env.API_TOKEN);
  const sharpHeaders = session.fhirContext ? toSharpHeaders(session.fhirContext) : undefined;

  const results: string[] = [];

  for (const step of plan.steps) {
    try {
      const args = { ...step.args };
      if (sharpHeaders) {
        args._sharpHeaders = sharpHeaders;
      }

      const result = await mcpClient.callTool(step.tool, args, sharpHeaders);

      if (result.success) {
        results.push(`[${step.tool}] ${result.content}`);
        session.taskResults.push({ tool: step.tool, result: result.content });
      } else {
        results.push(`[${step.tool}] Error: ${result.error}`);
      }
    } catch (error) {
      results.push(
        `[${step.tool}] Execution failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return results.join("\n\n");
}

export function formatResponse(
  workflowResult: string,
  plan: WorkflowPlan,
  message: string
): string {
  const lines: string[] = [];

  lines.push(`## ${plan.summary}`);
  lines.push("");
  lines.push(workflowResult);
  lines.push("");

  if (plan.requiresConfirmation) {
    lines.push("⚠️ This action requires explicit confirmation before execution.");
  }

  if (workflowResult.includes("Clinical Disclaimer")) {
    lines.push("");
    lines.push("⚠️ **Clinical Disclaimer:** AI-generated decision support must be reviewed by a licensed clinician.");
  }

  return lines.join("\n");
}
