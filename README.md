# Agent-Med

A professional clinical automation platform for physician workflows, featuring Ambient Scribe, Prior Auth automation, Patient follow-up scheduling, and Clinical decision support.

## Architecture

This is a monorepo with two packages:
- `@doctor-agent/core` - TypeScript CLI + API server
- `@doctor-agent/ui` - React-based professional Web Studio dashboard

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
docker run --rm -p 3001:3001 --env-file .env -v $PWD/data:/app/data agent-med:latest
```

### Docker Compose
```bash
docker compose up -d --build
```

## Monorepo Structure

```
doctor-agent/
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
│   └── ui/           # React Web Studio
│       └── src/
│           ├── components/     # React components
│           ├── lib/            # Firebase integration
│           └── services/       # AI services
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

## License

Apache 2.0