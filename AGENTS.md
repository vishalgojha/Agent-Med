# Repository Guidelines

## Project Structure & Module Organization
Core code lives in `src-ts/`:
- `capabilities/` implements domain workflows (`scribe`, `prior-auth`, `follow-up`, `decision-support`).
- `engine/` handles intent creation, risk gating, execution, and replay audit logging.
- `db/` contains raw SQLite schema and migrations.
- `ai/` contains provider adapters and prompt assets in `ai/prompts/*.txt`.
- `tests/` contains Node test-runner specs for every capability and server behavior.
Entry points are `src-ts/index.ts` (CLI) and `src-ts/server.ts` (API). `bin/doctor.js` is the executable wrapper.

## Build, Test, and Development Commands
- `npm run init`: create DB and run migrations.
- `npm run start -- <command>`: run CLI commands (example: `npm run start -- scribe --transcript "..." --patient-id p_1 --doctor-id d_1`).
- `npm run serve`: start Express API on `PORT`.
- `npm test`: run `node:test` specs via `tsx`.
- `npm run typecheck`: strict TypeScript checks, no emit.
- `npm run build`: compile to `dist/`.

## Coding Style & Naming Conventions
TypeScript is strict and ES module based. Prefer small typed functions over classes. Use:
- `camelCase` for variables/functions.
- `PascalCase` for interfaces/types.
- `kebab-case` for file names (for example `prior-auth.ts`).
Use 2-space indentation and keep functions side-effect aware. Do not use `exec`, `spawn`, or `eval`. Keep errors structured via `appError(...)`.

## Testing Guidelines
Use `node:test` with `assert/strict` only. Keep tests in `src-ts/tests/*.spec.ts`.
- Name tests as behavior statements (example: `"api scope blocks admin endpoint for read-only scope"`).
- Use `setupTestDb()`/`teardownTestDb()` for isolated SQLite files.
- Stub AI and messaging adapters; never call real external APIs in tests.

## Commit & Pull Request Guidelines
Follow concise Conventional Commits seen in history, e.g.:
- `feat: ...`
- `fix: ...`
- `chore: ...`
PRs should include:
- clear scope and risk impact,
- test evidence (`npm run typecheck`, `npm test`),
- API/CLI examples if behavior changed,
- migration notes when schema changes.

## Security & Safety Notes
Never log PHI; use redaction utilities for names, DOB, and phone numbers. Default to dry-run for outbound operations. Respect risk gates (`HIGH` requires explicit confirmation).
