# Latest Handoff

## Task

Continue `lumamax/devin-dashboard` as the active control-plane pilot for multi-account Devin work.

The current objective is to operate multiple Devin accounts as interchangeable cloud workers that continue one shared git contour through:

- quota-aware routing
- repo bootstrap into fresh Devin sessions
- explicit branch ownership
- short factual handoffs
- local-supervisor / cloud-agent synchronization discipline

## Completed in this slice

- Quota-band classification is now first-class in the scoring engine:
  - new `QuotaBand` type in `src/lib/accountScorer.ts` with values `healthy | draining | checkpoint | forced-handoff | stop-work | unknown`
  - new `computeEffectiveHeadroom({ daily, weekly })` helper that returns `min(daily, weekly)` when both are present, falls back to whichever side is known, and returns `null` when neither is known
  - new `classifyQuotaBand(quota)` helper that applies the supervisor-cloud-sync-contract thresholds exactly: `≤2%` stop-work, `≤5%` forced-handoff, `≤10%` checkpoint, `≤20%` draining, otherwise healthy
- `ScoredAccount` now carries `effectiveHeadroom` and `quotaBand`
- `GET /api/accounts/pick-best` now includes `quotaBand` and `effectiveHeadroom` on both the `best` summary and each ranked entry
- `PickBestAccountPanel` renders a small quota-band badge (with band label and effective headroom percentage) next to every account name, including the highlighted best pick; each badge has a hover tooltip that quotes the band's operating rule
- Tests in `tests/accountScorer.test.ts` cover each band, both fallback paths (only daily known / only weekly known), the both-null case, the `min(daily, weekly)` semantics, and the new `ScoredAccount` fields

This is the first piece of the "Next best action" from the previous handoff: it makes quota bands visible to both the supervisor (via the API) and to humans (via the dashboard), so the next step (a forced checkpoint trigger and explicit branch / ownership / handoff coordination UI) can build on a stable shape.

## Previously completed (carried forward)

- Phase 2 in remote git state on `main`:
  - account scoring engine in `src/lib/accountScorer.ts`
  - `GET /api/accounts/pick-best`
  - dashboard ranking UI in `src/components/PickBestAccountPanel.tsx`
  - tests for the scoring model
- Backend-first Devin session bootstrap on the local control-plane side:
  - `src/lib/devinControlPlane.ts` can start a new Devin session through `POST /api/sessions`
  - username resolution falls back to recent session history when `/api/users/info` does not expose `username`
  - `connect-repo` tries API session creation first and falls back to CDP only if needed
  - account UI separates `Прошить репо` from `Старт` and shows session-specific bootstrap state
- `docs/supervisor-cloud-sync-contract.md` as the shared operating contract for:
  - milestone-based sync
  - quota-driven forced checkpoint / handoff thresholds
  - write-zone ownership for parallel Devin sessions
  - merge-back order when `origin/main` moved ahead
  - branch cleanup ownership
- Entry docs aligned so both local Codex and cloud Devin agents read the same operating model:
  - `AGENTS.md`
  - `README.md`
  - `docs/cloud-agent-operating-model.md`
  - `docs/handoffs/LATEST.md`

## Git state

- Repository: `lumamax/devin-dashboard`
- Working branch: `devin/1778932073-quota-band-classification`
- Base: `main` at `fb314a1` (feat: add devin bootstrap sync contract)
- Remote: `origin https://github.com/lumamax/devin-dashboard.git`
- PR: open against `main` (see PR link in session report)
- Continuity is git + handoff only; no requirement to recover prior VM state

## Validation

- `npm test` — 46/46 passing locally (35 baseline + 11 new quota-band tests)
- `npm run typecheck` — passing locally
- `npm run build` — passing locally
- `npm run lint` — NOT run: `next lint` is deprecated in Next 15 and the repo has no `.eslintrc` or `eslint.config.*`, so the script drops into an interactive setup prompt rather than running. This is a pre-existing repo configuration issue, not caused by this slice. Migrating off `next lint` (per Next 15 guidance) is a good candidate for a small follow-up PR.

## Environment notes for the next agent

- `tests/connectionStore.test.ts` calls a SQLite fallback that expects `/home/ubuntu/.omniroute/storage.sqlite` to exist. On a fresh VM that file is absent and the test fails. An empty SQLite DB with a `provider_connections` table is enough to satisfy the fallback. This has been added to the suggested environment blueprint update so future Devin VMs come up with that file already in place. The DB stays empty; nothing in production code depends on it being populated.
- The OS package `sqlite3` is needed because the same fallback shells out to the `sqlite3` binary. That is also part of the suggested blueprint update.

## Architecture decisions

- Durable continuity remains: private GitHub + branch state + handoff, not VM persistence
- The dashboard is the Devin-specific control plane, not the durable system of record
- The supervisor is responsible for deciding when work is safe to parallelize across multiple Devin sessions
- Quota decisions use effective remaining headroom:
  - `effective headroom = min(daily remaining, weekly remaining)`
- Forced-sync thresholds (now also encoded as a typed `QuotaBand`):
  - `<=20%` remaining: `draining` — do not start a broad new task
  - `<=10%` remaining: `checkpoint` — prepare a clean milestone push
  - `<=5%` remaining: `forced-handoff` — push working branch and hand off
  - `<=2%` remaining: `stop-work` — only finalize sync
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

With quota bands now visible end-to-end, the natural next step is to make the supervisor *act* on them:

1. In the local supervisor (Codex side, separate repo), poll `GET /api/accounts/pick-best` and, when the working account's `quotaBand` becomes `checkpoint` or worse, automatically trigger a checkpoint push + handoff prompt for the next account.
2. On the dashboard, add a clearly visible "current working account / current task branch / current quota band" status strip — so a supervisor or a human can answer "is it safe to start a new parallel task?" without reading code.
3. Migrate `npm run lint` off the deprecated `next lint` (per the Next 15 prompt) so lint can run non-interactively in CI and locally.

These can be done as three separate small PRs in any order.
