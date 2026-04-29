# Agent-Med

A professional clinical automation platform for physician workflows, featuring Ambient Scribe, Prior Auth automation, Patient follow-up scheduling, and Clinical decision support. Built with **SHARP-on-MCP** and **A2A** interoperability for the Prompt Opinion Agents Assemble challenge.

## Architecture

This is a monorepo with four packages:

| Package | Description | Port |
|---------|-------------|------|
| `@doctor-agent/core` | TypeScript CLI + Express API server | 3001 |
| `@doctor-agent/ui` | React-based professional Web Studio dashboard | 3000 |
| `@doctor-agent/mcp-server` | **SHARP-on-MCP** server with FHIR integration (Streamable HTTP) | 3002 |
| `@doctor-agent/a2a-agent` | **A2A** clinical orchestrator agent (JSON-RPC 2.0) | 3100 |

## Interoperability (Agents Assemble)

Agent-Med implements the three pillars of the Prompt Opinion platform:

### MCP + FHIR (SHARP-on-MCP Compliant)

FHIR context is passed via HTTP headers on every tool call. The MCP server reads these before tool logic runs and uses them to call upstream FHIR APIs. Tool arguments stay focused on what the LLM needs.

```
Tool call
  ├── arguments: { patientId, category, ... }
  └── Headers:
        ├── x-fhir-server-url: "https://fhir.example.org/r4"
        ├── x-fhir-access-token: "<bearer>"
        └── x-patient-id: "uuid" (optional)
```

**Available Tools (10):**

| Tool | Category | Description |
|------|----------|-------------|
| `get_patient` | FHIR | Look up or search Patient resources |
| `get_patient_summary` | FHIR | Full patient overview (conditions, meds, vitals, encounters) |
| `get_medications` | FHIR | MedicationRequest list with status filtering |
| `get_conditions` | FHIR | Condition list with clinical status filtering |
| `get_observations` | FHIR | Vital signs, labs with category/code/date filters |
| `get_encounters` | FHIR | Encounter/visit history |
| `scribe` | Clinical | Generate SOAP notes from transcripts |
| `prior_auth` | Clinical | Create/manage prior authorization requests |
| `follow_up` | Clinical | Schedule patient follow-up communications |
| `clinical_decision` | Clinical | AI clinical decision support with medication safety checks |

**Endpoints:**
- `POST /mcp` - Streamable HTTP MCP endpoint
- `GET /.well-known/mcp-server.json` - Server discovery card
- `GET /health` - Health check

### A2A + FHIR

FHIR context is passed in the A2A message `metadata` field, keyed by the SHARP extension URI declared in the Agent Card. A callback reads it when the message arrives, loads it into session state, and tools pull from session state at call time. Context persists across multi-turn conversations.

```
A2A message
  ├── parts:    [{ "text": "Show me this patient's medications" }]
  └── metadata:
        └── "https://sharponmcp.com/fhir-context":
              ├── fhirUrl:   "https://fhir.example.org"
              ├── fhirToken: "<bearer>"
              └── patientId: "uuid"
```

**Agent Card declares extension URI:**
```json
{
  "name": "Agent-Med Clinical Orchestrator",
  "capabilities": {
    "extensions": [{
      "uri": "https://sharponmcp.com/fhir-context",
      "description": "SHARP-on-MCP FHIR context propagation"
    }]
  },
  "skills": ["patient_lookup", "medications", "conditions", "scribe", "prior_auth", "follow_up", "decision_support"]
}
```

**Endpoints:**
- `POST /` - JSON-RPC 2.0 endpoint (`message/send`, `tasks/get`, `tasks/cancel`, `agent/get`)
- `GET /.well-known/agent.json` - A2A Agent Card
- `GET /health` - Health check

**Workflow Orchestration:**
The A2A agent routes natural language requests to MCP tools with intent-based planning:
- "Show me John Smith's medications" → `get_medications`
- "Create a SOAP note from this transcript..." → `scribe`
- "Submit prior auth for procedure 99213" → `get_patient_summary` → `prior_auth`
- "Is it safe to add metformin?" → `get_medications` → `clinical_decision`

### Full Platform Flow

```
Client/EHR
  │  SMART on FHIR auth → FHIR context
  ▼
┌─────────────────────────────────────────────────────┐
│  A2A Agent (port 3100)                              │
│  FHIR context in message metadata → session state   │
│  Intent routing → workflow planning                 │
└────────┬────────────────────────────────────────────┘
         │  MCP tool calls with SHARP headers
         ▼
┌─────────────────────────────────────────────────────┐
│  MCP Server (port 3002)                             │
│  x-fhir-server-url, x-fhir-access-token headers     │
│  10 tools: 6 FHIR + 4 clinical                      │
└────────┬────────────────────────────────────────────┘
         │  FHIR REST API
         ▼
┌─────────────────────────────────────────────────────┐
│  FHIR Server (HAPI, Epic, Cerner, etc.)             │
│  Patient, Condition, MedicationRequest,             │
│  Observation, Encounter resources                   │
└─────────────────────────────────────────────────────┘
```

## Requirements

- Node.js 18+
- npm

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Initialize database
npm run init

# Start API server
npm run serve

# In another terminal, start MCP server
npm run mcp:dev

# In another terminal, start A2A agent
npm run a2a:dev

# In another terminal, start UI
npm run ui:dev
```

## Environment

Configure `.env`:
- `ANTHROPIC_API_KEY`, `AI_MODEL` - AI provider
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` - SMS messaging
- `TWILIO_WEBHOOK_*` - Webhook configuration
- `PORT`, `DB_PATH`, `DRY_RUN` - Server config
- `API_TOKEN` or scoped `API_TOKEN_READ`, `API_TOKEN_WRITE`, `API_TOKEN_ADMIN`

**MCP Server:**
- `PORT` (default: 3002) - MCP server port
- `CORE_API_URL` (default: http://localhost:3000) - Core API URL for clinical tools
- `MCP_SERVER_URL` (default: http://localhost:3002) - Self-referencing URL for discovery

**A2A Agent:**
- `PORT` (default: 3100) - A2A agent port
- `MCP_SERVER_URL` (default: http://localhost:3002) - MCP server URL for tool calls
- `API_TOKEN` - Token for MCP server authentication
- `AGENT_URL` (default: http://localhost:3100) - Self-referencing URL for Agent Card

Set `DRY_RUN=true` to disable outbound sends globally.

## Core CLI Commands

```bash
# Health check
npm start -- health

# Doctor management
npm start -- doctor add --name "Dr. Ellis" --specialty primary_care
npm start -- doctor list

# Patient management
npm start -- patient add --doctor-id d_123 --name "Jane Doe" --phone +15551234567
npm start -- patient list

# Ambient Scribe
npm start -- scribe --transcript "Patient reports fatigue..." --patient-id p_123 --doctor-id d_123

# Prior Auth
npm start -- prior-auth --patient-id p_123 --doctor-id d_123 --procedure 99213 --diagnosis Z00.00 --insurer BCBS

# Follow-up scheduling
npm start -- follow-up --patient-id p_123 --doctor-id d_123 --trigger lab_result

# Decision support
npm start -- decide --query "Is it safe to add metformin?"
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/scribe` | Generate SOAP notes from transcripts |
| `POST /api/prior-auth` | Create prior auth requests |
| `POST /api/follow-up` | Schedule patient follow-ups |
| `POST /api/decide` | Clinical decision support |
| `GET /api/ops/metrics` | System metrics |
| `POST /webhooks/twilio/status` | Twilio delivery callbacks |

For complete API documentation, see the embedded Swagger docs or test with:

```bash
npm test
```

## Web Studio UI

Professional React-based dashboard with:
- **Dashboard** - System overview and metrics
- **Patient Registry** - Patient management interface
- **Ambient Scribe** - AI-powered clinical documentation

Authentication via Firebase (Google Sign-In).

### UI Setup

```bash
# Install UI dependencies
npm run ui:install

# Run UI in development
npm run ui:dev

# Build UI
npm run ui:build
```

Configure Firebase by copying the template:
```bash
cp packages/ui/firebase-applet-config.json packages/ui/firebase-local-config.json
# Edit with your Firebase project credentials
```

## Testing

```bash
# Run all tests
npm test

# Type check
npm run typecheck
```

Tests use stub AI clients - no real API calls are made.

## Deployment

### Docker
```bash
docker build -t agent-med:latest .
docker run --rm -p 3001:3001 -p 3002:3002 -p 3100:3100 --env-file .env -v $PWD/data:/app/data agent-med:latest
```

### Docker Compose
```bash
docker compose up -d --build
```

## Monorepo Structure

```
Agent-Med/
├── packages/
│   ├── core/          # CLI & API server
│   │   ├── bin/       # Executables
│   │   └── src/
│   │       ├── capabilities/    # Domain workflows
│   │       ├── commands/        # CLI commands
│   │       ├── http/
│   │       │   ├── middleware/  # Express middleware
│   │       │   └── routes/     # API route handlers
│   │       └── tests/          # Test specs
│   ├── ui/           # React Web Studio
│   │   └── src/
│   │       ├── components/     # React components
│   │       ├── lib/            # Firebase integration
│   │       └── services/       # AI services
│   ├── mcp-server/   # SHARP-on-MCP server with FHIR integration
│   │   └── src/
│   │       ├── tools/          # FHIR + clinical tool handlers
│   │       ├── fhir-client.ts  # FHIR REST API client
│   │       ├── fhir-context.ts # SHARP header extraction
│   │       └── index.ts        # Express + Streamable HTTP server
│   └── a2a-agent/    # A2A clinical orchestrator agent
│       └── src/
│           ├── orchestrator.ts # Intent routing + workflow execution
│           ├── mcp-client.ts   # MCP tool client
│           ├── fhir-context.ts # SHARP metadata extraction
│           └── index.ts        # Express + JSON-RPC 2.0 server
├── package.json     # Workspace root
└── README.md
```

## Safety Notes

- PHI fields (name, DOB, phone) are automatically redacted in logs
- Decision support always includes clinical disclaimer
- HIGH-risk actions require `--confirm` flag
- Follow-up idempotency prevents duplicate messages
- Durable queue with startup recovery ensures message delivery
- Webhook callbacks are body-limited and deduplicated
- FHIR access tokens are never logged; passed only via HTTP headers

## Standards Compliance

- **MCP** (Model Context Protocol) - Streamable HTTP transport
- **SHARP-on-MCP** - FHIR context propagation via HTTP headers
- **A2A** (Agent-to-Agent Protocol) - JSON-RPC 2.0 over HTTP
- **FHIR R4** - Patient, Condition, MedicationRequest, Observation, Encounter resources
- **HL7 SMART on FHIR** - Authentication pattern support

## License

Apache 2.0
