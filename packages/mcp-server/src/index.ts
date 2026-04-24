import { Server } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/server/types";

interface SharpContext {
  serverUrl?: string;
  accessToken?: string;
  patientId?: string;
}

const sharpContext: SharpContext = {};

const tools = [
  {
    name: "scribe",
    description: "Create a SOAP note from a doctor-patient transcript",
    inputSchema: {
      type: "object",
      properties: {
        transcript: { type: "string", description: "The transcript of the encounter" },
        patientId: { type: "string", description: "Patient ID" },
        doctorId: { type: "string", description: "Doctor ID" },
      },
      required: ["transcript", "patientId", "doctorId"],
    },
  },
  {
    name: "prior-auth",
    description: "Create or manage prior authorization requests",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["create", "status", "update"] },
        patientId: { type: "string", description: "Patient ID" },
        procedureCode: { type: "string", description: "CPT procedure code" },
        diagnosisCodes: { type: "array", items: { type: "string" }, description: "ICD diagnosis codes" },
        insurerId: { type: "string", description: "Insurer ID" },
        status: { type: "string", description: "Status update" },
      },
      required: ["action", "patientId"],
    },
  },
  {
    name: "follow-up",
    description: "Schedule or manage follow-up communications",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["schedule", "retry", "dispatch"] },
        patientId: { type: "string", description: "Patient ID" },
        body: { type: "string", description: "Message body" },
        channel: { type: "string", enum: ["sms", "whatsapp"] },
        followUpId: { type: "string", description: "Follow-up ID for retry" },
        confirm: { type: "boolean", description: "Confirmation flag" },
        dryRun: { type: "boolean", description: "Dry run mode" },
      },
      required: ["action", "patientId"],
    },
  },
  {
    name: "decision",
    description: "Get clinical decision support alerts",
    inputSchema: {
      type: "object",
      properties: {
        patientId: { type: "string", description: "Patient ID" },
        medications: { type: "array", items: { type: "string" }, description: "Current medications" },
        conditions: { type: "array", items: { type: "string" }, description: "Current conditions" },
      },
      required: ["patientId"],
    },
  },
];

export class MCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "doctor-agent-mcp",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleToolCall(name, args);
    });
  }

  private extractSharpHeaders(): Record<string, string> {
    return {
      serverUrl: sharpContext.serverUrl ?? "",
      accessToken: sharpContext.accessToken ?? "",
      patientId: sharpContext.patientId ?? "",
    };
  }

  async handleToolCall(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }> } {
    const headers = this.extractSharpHeaders();

    try {
      switch (name) {
        case "scribe": {
          const response = await this.callCoreApi("/api/scribe", "POST", {
            transcript: args.transcript,
            patientId: args.patientId,
            doctorId: args.doctorId,
            ...headers,
          });
          return [{ type: "text", text: JSON.stringify(response) }];
        }
        case "prior-auth": {
          const response = await this.callCoreApi(
            args.action === "create" ? "/api/prior-auth" : `/api/prior-auth/${args.id || ""}`,
            args.action === "create" ? "POST" : "PATCH",
            { ...args, ...headers }
          );
          return [{ type: "text", text: JSON.stringify(response) }];
        }
        case "follow-up": {
          let path = "/api/follow-up";
          let method = "POST";
          if (args.action === "retry" && args.followUpId) {
            path = `/api/follow-up/${args.followUpId}/retry`;
          } else if (args.action === "dispatch") {
            path = "/api/follow-up/dispatch";
          }
          const response = await this.callCoreApi(path, method, {
            ...args,
            confirm: args.confirm ?? false,
            dryRun: args.dryRun ?? false,
            ...headers,
          });
          return [{ type: "text", text: JSON.stringify(response) }];
        }
        case "decision": {
          const response = await this.callCoreApi("/api/decide", "POST", {
            patientId: args.patientId,
            medications: args.medications ?? [],
            conditions: args.conditions ?? [],
            ...headers,
          });
          return [{ type: "text", text: JSON.stringify(response) }];
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return [
        {
          type: "text",
          text: JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
        },
      ];
    }
  }

  private async callCoreApi(
    path: string,
    method: string,
    body: Record<string, unknown>
  ): Promise<unknown> {
    const baseUrl = process.env.CORE_API_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.API_TOKEN || ""}`,
      },
      body: method !== "GET" ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

const server = new MCPServer();
server.start().catch(console.error);