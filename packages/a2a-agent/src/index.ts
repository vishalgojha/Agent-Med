import express, { Request, Response } from "express";
import cors from "cors";
import { FhirContextMetadata, SHARP_EXTENSION_URI, extractFhirContextFromMessage } from "./fhir-context";
import { getOrCreateSession, SessionState, planWorkflow, executeWorkflow, formatResponse, SESSIONS } from "./orchestrator";

const AGENT_URL = process.env.AGENT_URL || "http://localhost:3100";
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:3002";

interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
    extensions?: Array<{
      uri: string;
      description: string;
      params?: Record<string, unknown>;
    }>;
  };
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags?: string[];
    examples?: string[];
  }>;
  defaultInputModes: string[];
  defaultOutputModes: string[];
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id?: string | number | null;
}

interface Task {
  id: string;
  sessionId?: string;
  status: "submitted" | "working" | "completed" | "failed" | "canceled";
  history: Array<{
    role: "user" | "agent";
    content: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  }>;
  artifacts?: Array<{
    name: string;
    description: string;
    content: string;
  }>;
  created: number;
  updated: number;
}

const tasks = new Map<string, Task>();

const agentCard: AgentCard = {
  name: "Agent-Med Clinical Orchestrator",
  description: "Healthcare AI agent for clinical workflow orchestration with FHIR data integration. Supports SOAP note generation, prior authorization, follow-up scheduling, and clinical decision support.",
  url: AGENT_URL,
  version: "0.2.0",
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: true,
    extensions: [
      {
        uri: SHARP_EXTENSION_URI,
        description: "SHARP-on-MCP FHIR context propagation. Pass FHIR server URL, access token, and patient ID in message metadata.",
        params: {
          requiredHeaders: ["fhirUrl", "fhirToken"],
          optionalHeaders: ["patientId"],
        },
      },
    ],
  },
  skills: [
    {
      id: "patient_lookup",
      name: "Patient Record Retrieval",
      description: "Look up patient demographics, conditions, medications, vitals, and encounter history from FHIR server",
      tags: ["fhir", "patient", "lookup"],
      examples: ["Find patient John Smith", "Show me the summary for patient 12345"],
    },
    {
      id: "medications",
      name: "Medication Review",
      description: "Retrieve and review patient medication lists from FHIR MedicationRequest resources",
      tags: ["fhir", "medication", "review"],
      examples: ["What medications is the patient taking?", "Show me the current prescriptions"],
    },
    {
      id: "conditions",
      name: "Condition Management",
      description: "Retrieve active and historical conditions from FHIR Condition resources",
      tags: ["fhir", "conditions", "diagnosis"],
      examples: ["What are the patient's active conditions?", "Show the diagnosis list"],
    },
    {
      id: "scribe",
      name: "SOAP Note Generation",
      description: "Generate clinical SOAP notes from encounter transcripts using AI",
      tags: ["clinical", "documentation", "soap"],
      examples: ["Create a SOAP note from this transcript: ..."],
    },
    {
      id: "prior_auth",
      name: "Prior Authorization",
      description: "Create and manage prior authorization requests with FHIR context",
      tags: ["clinical", "authorization", "insurance"],
      examples: ["Submit prior auth for procedure 99213", "Check authorization status"],
    },
    {
      id: "follow_up",
      name: "Follow-up Scheduling",
      description: "Schedule and manage patient follow-up communications via SMS or WhatsApp",
      tags: ["clinical", "scheduling", "communication"],
      examples: ["Schedule a follow-up for this patient", "Send follow-up reminder"],
    },
    {
      id: "decision_support",
      name: "Clinical Decision Support",
      description: "Get AI-powered clinical decision alerts and medication safety checks",
      tags: ["clinical", "decision", "safety"],
      examples: ["Is it safe to add metformin?", "Check for drug interactions"],
    },
  ],
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
};

const app = express();
app.use(cors());
app.use(express.json());

// A2A Agent Card discovery
app.get("/.well-known/agent.json", (_req: Request, res: Response) => {
  res.json(agentCard);
});

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    agent: "agent-med-a2a",
    version: "0.2.0",
    tasks: tasks.size,
    sessions: SESSIONS.size,
  });
});

// JSON-RPC 2.0 endpoint
app.post("/", (req: Request, res: Response) => {
  const body = req.body as JsonRpcRequest | JsonRpcRequest[];

  if (Array.isArray(body)) {
    res.json(body.map((req) => handleJsonRpc(req)));
    return;
  }

  const result = handleJsonRpc(body);
  res.json(result);
});

// Legacy REST endpoints for backwards compatibility
app.post("/tasks/send", async (req: Request, res: Response) => {
  const result = await handleTaskSend(req.body);
  res.json(toJsonRpcResponse(result.id, result));
});

app.post("/tasks/get", (req: Request, res: Response) => {
  const { id } = req.body;
  const task = tasks.get(id as string);
  if (!task) {
    res.json(toJsonRpcError(null, -32601, "Task not found"));
    return;
  }
  res.json(toJsonRpcResponse(id, taskToResponse(task)));
});

app.post("/tasks/cancel", (req: Request, res: Response) => {
  const { id } = req.body;
  const task = tasks.get(id as string);
  if (!task) {
    res.json(toJsonRpcError(null, -32601, "Task not found"));
    return;
  }
  task.status = "canceled";
  task.updated = Date.now();
  res.json(toJsonRpcResponse(id, { id: task.id, status: "canceled" }));
});

// JSON-RPC 2.0 method handler
function handleJsonRpc(req: JsonRpcRequest) {
  const { method, params, id } = req;

  switch (method) {
    case "message/send":
      return handleJsonRpcMessageSend(params, id);
    case "message/stream":
      return handleJsonRpcMessageSend(params, id);
    case "tasks/get":
      return handleJsonRpcTasksGet(params, id);
    case "tasks/cancel":
      return handleJsonRpcTasksCancel(params, id);
    case "agent/get":
      return handleJsonRpcAgentGet(id);
    default:
      return toJsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

async function handleJsonRpcMessageSend(
  params: Record<string, unknown> | undefined,
  id: string | number | null | undefined
) {
  if (!params?.message) {
    return toJsonRpcError(id, -32602, "Missing message parameter");
  }

  const message = params.message as { parts?: Array<{ type: string; text: string }>; metadata?: Record<string, unknown> };
  const sessionId = (params.sessionId as string) ?? `session_${Date.now()}`;
  const text = message.parts?.[0]?.text ?? "";

  try {
    const result = await handleTaskSend({
      sessionId,
      message: { parts: message.parts },
      metadata: message.metadata,
      configuration: params.configuration,
    });
    return toJsonRpcResponse(id, result);
  } catch (error) {
    return toJsonRpcError(id, -32603, error instanceof Error ? error.message : "Internal error");
  }
}

function handleJsonRpcTasksGet(
  params: Record<string, unknown> | undefined,
  id: string | number | null | undefined
) {
  if (!params?.id) {
    return toJsonRpcError(id, -32602, "Missing task ID");
  }
  const task = tasks.get(params.id as string);
  if (!task) {
    return toJsonRpcError(id, -32601, "Task not found");
  }
  return toJsonRpcResponse(id, taskToResponse(task));
}

function handleJsonRpcTasksCancel(
  params: Record<string, unknown> | undefined,
  id: string | number | null | undefined
) {
  if (!params?.id) {
    return toJsonRpcError(id, -32602, "Missing task ID");
  }
  const task = tasks.get(params.id as string);
  if (!task) {
    return toJsonRpcError(id, -32601, "Task not found");
  }
  task.status = "canceled";
  task.updated = Date.now();
  return toJsonRpcResponse(id, { id: task.id, status: "canceled" });
}

function handleJsonRpcAgentGet(id: string | number | null | undefined) {
  return toJsonRpcResponse(id, agentCard);
}

async function handleTaskSend(body: Record<string, unknown>) {
  const sessionId = (body.sessionId as string) ?? `session_${Date.now()}`;
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const metadata = (body.metadata as Record<string, unknown>) ?? {};
  const configuration = (body.configuration as Record<string, unknown>) ?? {};

  const userMessage = extractUserMessage(body.message);

  const session = getOrCreateSession(sessionId);

  // Extract FHIR context from message metadata (SHARP extension)
  const fhirContext = extractFhirContextFromMessage(metadata);
  if (fhirContext) {
    session.fhirContext = fhirContext;
    if (fhirContext.patientId) {
      session.patientId = fhirContext.patientId;
    }
  }

  // Also check configuration for FHIR context
  if (!session.fhirContext && configuration.fhirUrl) {
    session.fhirContext = {
      fhirUrl: configuration.fhirUrl as string,
      fhirToken: configuration.fhirToken as string | undefined,
      patientId: configuration.patientId as string | undefined,
    };
    if (session.fhirContext.patientId) {
      session.patientId = session.fhirContext.patientId;
    }
  }

  // Also check direct params
  if (body.patientId && !session.patientId) {
    session.patientId = body.patientId as string;
  }

  const task: Task = {
    id: taskId,
    sessionId,
    status: "working",
    history: [
      { role: "user", content: userMessage, timestamp: Date.now(), metadata },
    ],
    created: Date.now(),
    updated: Date.now(),
  };

  session.conversationHistory.push({
    role: "user",
    content: userMessage,
    timestamp: Date.now(),
  });

  tasks.set(taskId, task);

  try {
    const plan = planWorkflow(userMessage, session);
    const result = await executeWorkflow(plan, session);
    const formattedResponse = formatResponse(result, plan, userMessage);

    task.status = "completed";
    task.updated = Date.now();
    task.history.push({ role: "agent", content: formattedResponse, timestamp: Date.now() });
    task.artifacts = [
      {
        name: "workflow_result",
        description: plan.summary,
        content: result,
      },
    ];

    session.conversationHistory.push({
      role: "agent",
      content: formattedResponse,
      timestamp: Date.now(),
    });

    return taskToResponse(task);
  } catch (error) {
    task.status = "failed";
    task.updated = Date.now();
    task.history.push({
      role: "agent",
      content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      timestamp: Date.now(),
    });

    return taskToResponse(task);
  }
}

function extractUserMessage(message: unknown): string {
  if (!message) return "";
  if (typeof message === "string") return message;
  const msg = message as Record<string, unknown>;
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p: Record<string, unknown>) => p.type === "text")
      .map((p: Record<string, string>) => p.text)
      .join("\n");
  }
  if (msg.text) return msg.text as string;
  if (msg.content) return msg.content as string;
  return JSON.stringify(message);
}

function taskToResponse(task: Task) {
  const lastMessage = task.history[task.history.length - 1];
  return {
    id: task.id,
    sessionId: task.sessionId,
    status: task.status,
    history: task.history.map((h) => ({
      role: h.role,
      parts: [{ type: "text", text: h.content }],
      metadata: h.metadata,
    })),
    artifacts: task.artifacts,
    created: task.created,
    updated: task.updated,
  };
}

function toJsonRpcResponse(
  id: string | number | null | undefined,
  result: unknown
) {
  return { jsonrpc: "2.0", result, id: id ?? null };
}

function toJsonRpcError(
  id: string | number | null | undefined,
  code: number,
  message: string
) {
  return {
    jsonrpc: "2.0",
    error: { code, message },
    id: id ?? null,
  };
}

const PORT = Number(process.env.PORT || 3100);
app.listen(PORT, () => {
  console.log(`Agent-Med A2A Agent listening on port ${PORT}`);
  console.log(`Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
  console.log(`JSON-RPC endpoint: POST http://localhost:${PORT}/`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
