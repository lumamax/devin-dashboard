# Latest Handoff

## Task

Continue `lumamax/devin-dashboard` as the active control-plane pilot for multi-account Devin work.

The current objective is to operate multiple Devin accounts as interchangeable cloud workers that continue one shared git contour through:

- quota-aware routing
- repo bootstrap into fresh Devin sessions
- explicit branch ownership
- short factual handoffs
- local-supervisor / cloud-agent synchronization discipline

## Completed

- Phase 2 is now in remote git state on `main`:
  - account scoring engine in `src/lib/accountScorer.ts`
  - `GET /api/accounts/pick-best`
  - dashboard ranking UI in `src/components/PickBestAccountPanel.tsx`
  - tests for the scoring model
- Added backend-first Devin session bootstrap on the local control-plane side:
  - `src/lib/devinControlPlane.ts` can start a new Devin session through `POST /api/sessions`
  - username resolution now falls back to recent session history when `/api/users/info` does not expose `username`
  - `connect-repo` tries API session creation first and falls back to CDP only if needed
  - account UI now separates `Прошить репо` from `Старт` and shows session-specific bootstrap state
- Added `docs/supervisor-cloud-sync-contract.md` as the shared operating contract for:
  - milestone-based sync
  - quota-driven forced checkpoint / handoff thresholds
  - write-zone ownership for parallel Devin sessions
  - merge-back order when `origin/main` moved ahead
  - branch cleanup ownership
- Updated entry docs so both local Codex and cloud Devin agents read the same operating model:
  - `AGENTS.md`
  - `README.md`
  - `docs/cloud-agent-operating-model.md`
  - `docs/handoffs/LATEST.md`

## Git state

- Repository: `lumamax/devin-dashboard`
- Working branch: `main`
- Remote: `origin https://github.com/lumamax/devin-dashboard.git`
- Published base already on remote `main`: `53fd370` (pick-best-account phase)
- There is no requirement to recover old VM state; continuity is git + handoff only

## Validation

- `npm test` — passing locally
- `npm run build` — passing locally
- Live checks already confirmed that backend-first bootstrap can create real Devin sessions and inject the bootstrap prompt through the Devin API path

## Architecture decisions

- Durable continuity remains: private GitHub + branch state + handoff, not VM persistence
- The dashboard is the Devin-specific control plane, not the durable system of record
- The supervisor is responsible for deciding when work is safe to parallelize across multiple Devin sessions
- Quota decisions should use effective remaining headroom:
  - `effective headroom = min(daily remaining, weekly remaining)`
- Default forced-sync thresholds are now:
  - `<=10%` remaining: prepare checkpoint push
  - `<=5%` remaining: push working branch and hand off
  - `<=2%` remaining: stop new implementation work and only finalize sync if possible
- Branch cleanup is supervisor-owned by default; cloud agents should not delete another session's branch unless explicitly instructed

## Important context for the next agent

- Treat every new Devin session as a fresh clone
- Read these files first:
  1. `README.md`
  2. `AGENTS.md`
  3. `docs/cloud-agent-operating-model.md`
  4. `docs/supervisor-cloud-sync-contract.md`
  5. `docs/devin-control-plane-target.md`
  6. `docs/multi-account-git-access.md`
  7. `docs/github-app-control-plane-plan.md`
- If `origin/main` moved while unpublished local work exists, follow the sync contract order exactly:
  1. save local state
  2. update local `main`
  3. reapply local work on top
  4. resolve conflicts consciously
  5. rerun affected checks

## Next best action

Build the next operator-grade step on top of this foundation:

- make the supervisor use live quota thresholds and `pick-best-account` together
- trigger a forced checkpoint / handoff before a working Devin session enters the final quota band
- surface branch / ownership / handoff status clearly enough that multiple Devin sessions can be coordinated without guessing
