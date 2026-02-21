# Branch Job Map

Development continues on `main`.
Parallel specialty workstreams are prepared as branches + worktrees:

- `specialty/scribe-soap` -> `worktrees/scribe`
  - SOAP quality, transcript normalization, note templates, specialty-adaptive phrasing.

- `specialty/prior-auth-lifecycle` -> `worktrees/prior-auth`
  - PA status transitions, insurer-specific forms, submission adapters, denial recovery.

- `specialty/follow-up-messaging` -> `worktrees/follow-up`
  - follow-up reliability, delivery retries/backoff, channel policies, campaign controls.

- `specialty/decision-support` -> `worktrees/decision`
  - alert precision, guideline grounding, explainability and ranking improvements.

- `specialty/platform-ops` -> `worktrees/platform`
  - security, auth scopes/JWT, rate-limit persistence, observability, deployment hardening.

Branch discipline:
- No direct cross-cutting refactors on specialty branches without backport plan.
- Merge specialty branches into `main` through tested PR-style commits.
- Keep shared schema/API changes coordinated via `specialty/platform-ops`.
