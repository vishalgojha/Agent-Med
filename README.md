# Agent-Med

Clinical automation platform with Ambient Scribe, Prior Auth, Patient follow-ups, and Decision Support. **SHARP-on-MCP** + **A2A** interoperable.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Web UI (port 3000)

```bash
npm run ui:dev
```

Then open **http://localhost:3000** in your browser.

No login required — Patient data is stored in localStorage.

### 3. Start the Backend API (port 3001)

In a **new terminal**:

```bash
npm run init    # creates the SQLite database (only needed once)
npm run serve   # starts API on port 3001
```

---

## All Services at a Glance

| Service | Command | Port | Required? |
|---------|---------|------|-----------|
| Web UI | `npm run ui:dev` | 3000 | **Yes** (for web interface) |
| Core API | `npm run serve` | 3001 | **Yes** (for backend) |
| MCP Server | `npm run mcp:dev` | 3002 | Optional (FHIR) |
| A2A Agent | `npm run a2a:dev` | 3100 | Optional (orchestrator) |

**Minimum setup:** Just run `npm run ui:dev`. The web UI works standalone with localStorage.

---

## Web UI Features

### Dashboard
- Provider overview with stats (active patients, encounters today)
- Patient queue and encounter log
- Risk propensity metrics

### Patient Registry
- Full CRUD operations for patient records
- Photo upload/edit/delete
- Search and filtering

### Ambient Scribe
- Real-time voice-to-EMR transcription
- Google Gemini AI analysis
- Patient matching and encounter review

### FHIR Explorer
- Browse FHIR resources (patients, medications, conditions, observations)
- Query interface via MCP backend
- SHARP-on-MCP interoperability

### Clinical Tools
- **Decision Support**: Clinical guidance and recommendations
- **Prior Authorization**: Pre-approval workflow
- **Follow-up Scheduling**: Automated patient follow-ups
- **SOAP Note Generation**: Structured clinical documentation

### A2A Agent
- Agent-to-agent workflow orchestration
- Natural language clinical workflows
- Quick action templates

### Status
- Health monitoring for all services
- Latency metrics and system status

### Settings
- FHIR server configuration
- SHARP context setup

---

## Environment

Copy the template and fill in what you need:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | AI provider for scribe/decision support |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | SMS follow-ups |
| `DRY_RUN=true` | Disable all outbound sends |
| `API_TOKEN` | API auth (optional) |
| `PORT` | Core API port (default 3001) |

---

## Testing

```bash
npm test          # 46 passing tests
npm run typecheck # strict TypeScript check
```

---

## Safety

- PHI redacted in logs
- `DRY_RUN=true` disables outbound sends
- HIGH-risk actions require `--confirm`
- FHIR tokens passed only via HTTP headers, never logged

## License

Apache 2.0

---

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.

**Maintainer:** Vishal Gohja ([vishal@chaoscraftlabs.com](mailto:vishal@chaoscraftlabs.com))
