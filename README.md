# doctor-agent

`doctor-agent` is a TypeScript CLI + API server for physician workflows:
- Ambient Scribe (transcript -> SOAP note)
- Prior Auth draft automation
- Patient follow-up scheduling/messaging
- Clinical decision support alerts

## Requirements
- Node.js 18+
- npm

## Install
```bash
npm install
cp .env.example .env
```

## Environment
Configure `.env`:
- `ANTHROPIC_API_KEY`, `AI_MODEL`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `PORT`, `DB_PATH`, `DRY_RUN`, `API_TOKEN`
- `API_TOKEN_READ`, `API_TOKEN_WRITE`, `API_TOKEN_ADMIN`
- `API_RATE_LIMIT_WINDOW_MS`, `API_RATE_LIMIT_MAX`
- `REPLAY_RETENTION_DAYS`, `REPLAY_RETENTION_INTERVAL_MS`

Set `DRY_RUN=true` to disable outbound sends globally.
Set `API_TOKEN` to protect `/api/*` routes with a single admin token.
For scoped access, set `API_TOKEN_READ`, `API_TOKEN_WRITE`, and `API_TOKEN_ADMIN` and use matching bearer tokens.
Replay retention pruning runs automatically in server mode using the retention env vars.

## Initialize
```bash
npm run init
```
Creates SQLite DB, runs migrations, and prints health checks.

## CLI Examples
```bash
# Health
npm run start -- health
npm run start -- doctor health

# Doctor profiles
npm run start -- doctor add --name "Dr. Ellis" --specialty primary_care
npm run start -- doctor list

# Fast local demo seed
npm run start -- seed

# Patient management
npm run start -- patient add --doctor-id d_123 --name "Jane Doe" --dob 1980-01-01 --phone +15551234567
npm run start -- patient list

# Ambient scribe
npm run start -- scribe --transcript "Patient reports fatigue..." --patient-id p_123 --doctor-id d_123

# Prior auth
npm run start -- prior-auth --patient-id p_123 --doctor-id d_123 --procedure 99213 --diagnosis Z00.00 --insurer BCBS
npm run start -- prior-auth --patient-id p_123 --doctor-id d_123 --procedure 99213 --diagnosis Z00.00 --insurer BCBS --submit --confirm
npm run start -- prior-auth-list --patient-id p_123
npm run start -- prior-auth-status --id pa_123 --status submitted --confirm

# Follow-up (dry-run)
npm run start -- follow-up --patient-id p_123 --doctor-id d_123 --trigger lab_result --dry-run

# Decision support
npm run start -- decide --patient-id p_123 --query "Is it safe to add metformin?"

# Replay log
npm run start -- replay list
npm run start -- replay prune --days 30 --confirm

# Follow-up operations
npm run start -- follow-up-list --status scheduled
npm run start -- follow-up-retry --id fu_123 --confirm --dry-run
npm run start -- follow-up-retry-bulk --confirm --dry-run --limit 25
npm run start -- follow-up-dispatch --confirm --dry-run

# Ops
npm run start -- ops-metrics
```

## API
Start server:
```bash
npm run serve
```

Endpoints:
- `POST /api/scribe`
- `POST /api/prior-auth`
- `GET /api/prior-auth`
- `GET /api/prior-auth/:id`
- `PATCH /api/prior-auth/:id/status`
- `POST /api/follow-up`
- `GET /api/follow-up`
- `POST /api/follow-up/:id/retry`
- `POST /api/follow-up/retry-failed-bulk`
- `POST /api/follow-up/dispatch`
- `GET /api/ops/metrics`
- `POST /api/decide`
- `GET /api/replay`
- `GET /api/replay/:id`
- `POST /api/replay/prune`

Example payloads:
```json
{ "transcript": "Patient reports cough", "patientId": "p_123", "doctorId": "d_123" }
```
```json
{ "patientId": "p_123", "doctorId": "d_123", "procedureCode": "99213", "diagnosisCodes": ["Z00.00"], "insurerId": "BCBS" }
```
```json
{ "patientId": "p_123", "doctorId": "d_123", "trigger": "lab_result", "dryRun": true }
```
```json
{ "patientId": "p_123", "query": "Is it safe to add metformin given current meds?" }
```
If `API_TOKEN` is configured, include:
```http
Authorization: Bearer <API_TOKEN>
```
Optional trace headers:
```http
x-request-id: your-request-id
x-actor-id: doctor-or-service-id
```

Readiness endpoint:
- `GET /health/ready` (includes DB/queue snapshot)

## Deployment
Docker:
```bash
docker build -t doctor-agent:latest .
docker run --rm -p 3001:3001 --env-file .env -v $PWD/data:/app/data doctor-agent:latest
```

Docker Compose:
```bash
docker compose up -d --build
docker compose ps
```

## Testing
```bash
npm test
npm run typecheck
```

Tests use stub AI clients; no real model calls are made.

## Safety Notes
- Logger redacts `name`, `dob`, `phone`, and related fields.
- Decision support responses always include a disclaimer object.
- HIGH-risk actions require `--confirm` / `confirm: true`.
- Follow-up idempotency is enforced by `(patient_id, trigger, scheduled_at)`.
