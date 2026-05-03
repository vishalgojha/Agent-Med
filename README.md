# Agent-Med

Clinical automation platform with Ambient Scribe, Prior Auth, Patient follow-ups, and Decision Support. **SHARP-on-MCP** + **A2A** interoperable.

## Installation

### Option 1: Global Installation (Recommended for CLI usage)

```bash
npm install -g @agent-med/core
```

Then use the `agent-med` command anywhere:

```bash
agent-med --help
agent-med init
agent-med serve
```

### Option 2: Local Development (Monorepo)

```bash
git clone https://github.com/vishalgojha/Agent-Med.git
cd Agent-Med
npm install
```

### 2. Start the backend (Core API — port 3001)

This is the main server. Start it **first** before anything else.

```bash
agent-med init    # creates the SQLite database (only needed once)
agent-med serve   # starts API on port 3001
```

Or if using local development:

```bash
npm run init    # creates the SQLite database (only needed once)
npm run serve   # starts API on port 3001
```

Keep this terminal running.

### 3. Start the MCP server (port 3002) — optional

Only needed if you want FHIR tool access. Open a **new terminal**:

```bash
npm run mcp:dev
```

### 4. Start the A2A agent (port 3100) — optional

Open another terminal:

```bash
npm run a2a:dev
```

### 5. Open the Web UI (port 3000)

Open another terminal:

```bash
npm run ui:dev
```

Then open **http://localhost:3000** in your browser.

No login required — Firebase was removed. Patient data is stored in localStorage.

---

## All ports at a glance

| Service | Command | Port | Required? |
|---------|---------|------|-----------|
| Core API | `npm run serve` | 3001 | **Yes** |
| Web UI | `npm run ui:dev` | 3000 | Optional |
| MCP Server | `npm run mcp:dev` | 3002 | Optional (FHIR) |
| A2A Agent | `npm run a2a:dev` | 3100 | Optional (orchestrator) |

**Minimum setup:** Just run `npm run init` then `npm run serve`. The CLI works standalone.

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

## CLI Commands

### Using Global Installation

```bash
agent-med doctor add --name "Dr. Ellis" --specialty primary_care
agent-med doctor list
agent-med patient add --doctor-id d_123 --name "Jane Doe" --phone +15551234567
agent-med patient list
agent-med scribe --transcript "Patient reports fatigue..." --patient-id p_123 --doctor-id d_123
agent-med prior-auth --patient-id p_123 --doctor-id d_123 --procedure 99213 --diagnosis Z00.00 --insurer BCBS
agent-med follow-up --patient-id p_123 --doctor-id d_123 --trigger lab_result
agent-med decide --query "Is it safe to add metformin?"
agent-med health
```

### Using Local Development

```bash
npm start -- doctor add --name "Dr. Ellis" --specialty primary_care
npm start -- doctor list
npm start -- patient add --doctor-id d_123 --name "Jane Doe" --phone +15551234567
npm start -- patient list
npm start -- scribe --transcript "Patient reports fatigue..." --patient-id p_123 --doctor-id d_123
npm start -- prior-auth --patient-id p_123 --doctor-id d_123 --procedure 99213 --diagnosis Z00.00 --insurer BCBS
npm start -- follow-up --patient-id p_123 --doctor-id d_123 --trigger lab_result
npm start -- decide --query "Is it safe to add metformin?"
npm start -- health
```

---

## Web UI Pages

| Tab | Description |
|-----|-------------|
| Dashboard | System overview and metrics |
| Patient Registry | Patient CRUD (localStorage) |
| Ambient Scribe | Voice transcription + SOAP notes |
| FHIR Explorer | Browse FHIR resources via MCP |
| Clinical Tools | Decision support, prior auth, follow-ups |
| A2A Agent | Natural language clinical workflows |
| Status | Health checks for all services |
| Settings | FHIR server configuration |

---

## Testing

```bash
npm test          # 46 passing tests
npm run typecheck # strict TypeScript check
```

---

## Global Installation Notes

- The CLI requires Node.js >= 18
- Database is created in the current working directory as `agent-med.db`
- Run `agent-med health` to verify setup
- All PHI is redacted from logs by default

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
