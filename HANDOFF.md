# doctor-agent Handoff

## Current Status
- Project scaffold is complete and runnable.
- `npm run typecheck` passes.
- `npm test` passes on local host runs; in this sandbox it fails with `spawn EPERM`.
- `npm run init` runs migrations and health checks.

## What Is Implemented
- CLI via `commander` in `src-ts/index.ts`
  - nested doctor commands (`doctor add/list/show/health`)
  - `seed` command for rapid demos
- API server via `express` in `src-ts/server.ts`
  - request payload validation (422 errors for malformed inputs)
  - optional Bearer-token auth for `/api/*` via `API_TOKEN` or scoped tokens:
    - `API_TOKEN_READ`, `API_TOKEN_WRITE`, `API_TOKEN_ADMIN`
  - in-memory API rate limiting via `API_RATE_LIMIT_WINDOW_MS` and `API_RATE_LIMIT_MAX`
  - request trace via `x-request-id` and actor tagging via `x-actor-id`
  - prior-auth lifecycle routes (`GET`, `PATCH status`)
  - follow-up listing and retry routes
  - manual due-dispatch route for scheduled follow-ups
  - `/health/ready` readiness endpoint with DB + queue snapshot
  - replay prune endpoint for retention management
  - scheduled replay retention prune in `startServer`
  - scope-based authorization derived from authenticated bearer token (`read|write|admin`)
  - DB-backed API rate limiting via `rate_limits` table (shared state across processes)
- SQLite storage via `better-sqlite3`:
  - schema: `src-ts/db/schema.sql`
  - client/migrations: `src-ts/db/client.ts`, `src-ts/db/migrations.ts`
- Core engine:
  - intent creation: `src-ts/engine/intent.ts`
  - risk gate + countdown: `src-ts/engine/risk.ts`
  - executor + replay append: `src-ts/engine/executor.ts`, `src-ts/engine/replay.ts`
  - replay rows now include `request_id` and `actor_id`
- Ops metrics snapshot utility:
  - `src-ts/ops/metrics.ts`
- AI layer:
  - provider interface + Anthropic/stub clients: `src-ts/ai/client.ts`
  - prompt loader: `src-ts/ai/prompts.ts`
  - robust JSON extractor: `src-ts/ai/parser.ts`
- Capabilities:
  - scribe: `src-ts/capabilities/scribe.ts`
  - prior auth: `src-ts/capabilities/prior-auth.ts`
  - follow-up + queue: `src-ts/capabilities/follow-up.ts`
  - decision support + disclaimer: `src-ts/capabilities/decision-support.ts`
- Messaging adapters:
  - interface/stub/twilio: `src-ts/messaging/`
- PHI redaction logger: `src-ts/logger.ts`
- Prior-auth lifecycle utilities:
  - `listPriorAuths`, `getPriorAuthById`, `updatePriorAuthStatus`
- Follow-up operational utility:
  - `listFollowUps`
  - `retryFailedFollowUp`
  - `dispatchDueFollowUps`
  - `retryFailedFollowUpsBulk` with bounded retry/backoff
  - dead-letter workflow for exhausted retries / irrecoverable sends
    - follow-up rows can transition to `dead_letter`
    - dead-letter audit records stored in `follow_up_dead_letters`
    - CLI/API read paths added for dead-letter triage

## Known Gaps / Improvements
- `bin/doctor.js` assumes `dist/` exists; improve DX with a `build` check or use `tsx` launcher for dev installs.
- Add stricter validation for optional fields (`age`, `weight`, `channel`) in CLI parsing.
- Expand API route coverage tests for all success and risk-gate paths.

## Safety / Compliance Notes
- Keep strict no-PHI logging behavior:
  - redact keys in logger before any output.
- Keep decision-support disclaimer in every response.
- Preserve risk gates:
  - HIGH requires explicit confirmation.
  - CRITICAL requires confirmation + countdown.
- Do not add `exec`, `spawn`, or `eval` in app code.

## Suggested Next Tasks (Priority)
1. Add dashboard or TUI for triage queue and pending follow-ups.
2. Move from static bearer tokens to signed token claims/JWT verification.
3. Add systemd/k8s manifests and secret management docs for production rollout.
4. Add dead-letter replay workflow (re-queue selected dead-letter items after operator review).
5. Add structured webhook callbacks for delivery outcomes.

## Useful Commands
```bash
npm install
npm run typecheck
npm test
npm run init
npm run start -- health
npm run serve
```

## Quick Smoke Flow
1. `npm run init`
2. Create doctor: `npm run start -- doctor add --name "Dr. Demo" --specialty primary_care`
3. Create patient: `npm run start -- patient add --doctor-id <doctorId> --name "Jane Doe" --phone +15551234567`
4. Run scribe/prior-auth/follow-up/decide commands with created IDs.
