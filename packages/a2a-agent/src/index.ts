import express from "express";
import { createServer } from "http";

interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    tools: string[];
  };
  skills?: Array<{ id: string; name: string; description: string }>;
}

interface Task {
  id: string;
  sessionId?: string;
  status: "pending" | "completed" | "failed" | "canceled";
  history: Array<{ role: "user" | "agent"; content: string }>;
}

const tasks = new Map<string, Task>();

const agentCard: AgentCard = {
  name: "Doctor Agent",
  description: "Healthcare AI agent for clinical workflows",
  url: process.env.AGENT_URL || "http://localhost:3100",
  version: "0.1.0",
  capabilities: {
    tools: ["scribe", "prior-auth", "follow-up", "decision"],
  },
  skills: [
    { id: "scribe", name: "SOAP Note Generation", description: "Create SOAP notes from transcripts" },
    { id: "prior-auth", name: "Prior Authorization", description: "Manage prior auth requests" },
    { id: "follow-up", name: "Follow-up Scheduling", description: "Schedule patient follow-ups" },
    { id: "decision", name: "Clinical Decision Support", description: "Get clinical decision alerts" },
  ],
};

const app = express();
app.use(express.json());

app.get("/.well-known/agent.json", (_req, res) => {
  res.json(agentCard);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/tasks/send", async (req, res) => {
  const { sessionId, message, parts, configuration } = req.body;
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const task: Task = {
    id: taskId,
    sessionId,
    status: "pending",
    history: [],
  };

  const userMessage = message?.parts?.[0]?.text || "";
  task.history.push({ role: "user", content: userMessage });

  tasks.set(taskId, task);

  try {
    const response = await processMessage(userMessage, configuration);
    task.history.push({ role: "agent", content: response });
    task.status = "completed";

    res.json({
      id: taskId,
      status: "completed",
      message: {
        role: "agent",
        parts: [{ type: "text", text: response }],
      },
    });
  } catch (error) {
    task.status = "failed";
    res.json({
      id: taskId,
      status: "failed",
      message: {
        role: "agent",
        parts: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : "Unknown error"}` }],
      },
    });
  }
});

app.post("/tasks/get", (req, res) => {
  const { id } = req.body;
  const task = tasks.get(id);

  if (!task) {
    res.json({ id, status: "not_found" });
    return;
  }

  const lastMessage = task.history[task.history.length - 1];
  res.json({
    id: task.id,
    status: task.status,
    message: lastMessage
      ? { role: lastMessage.role, parts: [{ type: "text", text: lastMessage.content }] }
      : undefined,
  });
});

app.post("/tasks/cancel", (req, res) => {
  const { id } = req.body;
  const task = tasks.get(id);

  if (!task) {
    res.json({ id, status: "not_found" });
    return;
  }

  task.status = "canceled";
  res.json({ id, status: "canceled" });
});

async function processMessage(
  message: string,
  _configuration?: Record<string, unknown>
): Promise<string> {
  const lower = message.toLowerCase();

  if (lower.includes("scribe") || lower.includes("soap note")) {
    return await callCoreApi("/api/scribe", {
      transcript: message,
      patientId: "p_default",
      doctorId: "d_default",
    });
  }

  if (lower.includes("prior auth")) {
    return await callCoreApi("/api/prior-auth", {
      patientId: "p_default",
      procedureCode: "12345",
      diagnosisCodes: ["Z00.00"],
      insurerId: "ins_default",
    });
  }

  if (lower.includes("follow-up") || lower.includes("schedule")) {
    return await callCoreApi("/api/follow-up", {
      patientId: "p_default",
      body: "Please call the office.",
      channel: "sms",
      dryRun: true,
    });
  }

  if (lower.includes("decision") || lower.includes("alert")) {
    return await callCoreApi("/api/decide", {
      patientId: "p_default",
      medications: [],
      conditions: [],
    });
  }

  return "I can help with: scribe (SOAP notes), prior-auth, follow-up scheduling, and clinical decision support.";
}

async function callCoreApi(
  path: string,
  body: Record<string, unknown>
): Promise<string> {
  const baseUrl = process.env.CORE_API_URL || "http://localhost:3000";
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.API_TOKEN || ""}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    return `API error: ${response.status}`;
  }

  const data = await response.json();
  return JSON.stringify(data, null, 2);
}

const port = Number(process.env.PORT || 3100);
const server = createServer(app);

server.listen(port, () => {
  console.log(`A2A Agent listening on port ${port}`);
  console.log(`Agent Card: http://localhost:${port}/.well-known/agent.json`);
});