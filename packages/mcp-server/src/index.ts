import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import cors from "cors";
import {
  registerGetPatient,
  registerGetPatientSummary,
  registerGetMedications,
  registerGetConditions,
  registerGetObservations,
  registerGetEncounters,
  registerScribe,
  registerPriorAuth,
  registerFollowUp,
  registerDecision,
} from "./tools/index.js";
import { SHARP_EXTENSION_URI } from "./fhir-context.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    server: "agent-med-mcp",
    version: "0.2.0",
    transport: "streamable-http",
    fhirContextRequired: true,
  });
});

app.get("/.well-known/mcp-server.json", (_req: Request, res: Response) => {
  res.json({
    name: "Agent-Med MCP Server",
    version: "0.2.0",
    description: "Healthcare AI MCP server with FHIR integration (SHARP-on-MCP compliant)",
    capabilities: {
      tools: {
        fhir: ["get_patient", "get_patient_summary", "get_medications", "get_conditions", "get_observations", "get_encounters"],
        clinical: ["scribe", "prior_auth", "follow_up", "clinical_decision"],
      },
      fhir_context_required: true,
    },
    extensions: {
      [SHARP_EXTENSION_URI]: {
        description: "SHARP-on-MCP FHIR context propagation",
        requiredHeaders: ["x-fhir-server-url", "x-fhir-access-token"],
        optionalHeaders: ["x-patient-id"],
      },
    },
    endpoints: {
      streamableHttp: `${process.env.MCP_SERVER_URL || "http://localhost:3002"}/mcp`,
    },
  });
});

app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const server = new McpServer(
      {
        name: "agent-med-mcp",
        version: "0.2.0",
      },
      {
        capabilities: {
          tools: {},
        },
        instructions: "Agent-Med MCP Server: FHIR-integrated healthcare tools using SHARP-on-MCP. Requires x-fhir-server-url and x-fhir-access-token HTTP headers for FHIR resource access.",
      }
    );

    registerGetPatient(server);
    registerGetPatientSummary(server);
    registerGetMedications(server);
    registerGetConditions(server);
    registerGetObservations(server);
    registerGetEncounters(server);
    registerScribe(server);
    registerPriorAuth(server);
    registerFollowUp(server);
    registerDecision(server);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const PORT = Number(process.env.PORT || 3002);
app.listen(PORT, () => {
  console.log(`Agent-Med MCP Server listening on port ${PORT}`);
  console.log(`MCP endpoint: POST http://localhost:${PORT}/mcp`);
  console.log(`Server card: http://localhost:${PORT}/.well-known/mcp-server.json`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
