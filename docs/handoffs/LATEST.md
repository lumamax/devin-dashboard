# Latest Handoff

## Task

Continue `lumamax/devin-dashboard` as the active control-plane pilot for multi-account Devin work.

The current objective is to operate multiple Devin accounts as interchangeable cloud workers that continue one shared git contour through:

- quota-aware routing
- repo bootstrap into fresh Devin sessions
- explicit branch ownership
- short factual handoffs
- local-supervisor / cloud-agent synchronization discipline

## Completed (this session)

- Encoded the canonical sync-contract quota bands in the account scorer:
  - new `QuotaBand` type: `unknown | healthy | draining | checkpoint | forced-handoff | stop-work | exhausted`
  - new `effectiveHeadroom(quota)` helper that returns `min(daily, weekly)` remaining, or the non-null side, or `null` when no quota data is available
  - new `computeQuotaBand(headroom)` helper that maps to the thresholds in `docs/supervisor-cloud-sync-contract.md` (>20 / ≤20 / ≤10 / ≤5 / ≤2 / ≤0)
  - `ScoredAccount` now carries `quotaBand` and `effectiveHeadroom` alongside the existing `lifecycle` signal
- `GET /api/accounts/pick-best` automatically surfaces the new fields through the existing `ranked` payload (no API shape break — fields are additive)
- `PickBestAccountPanel` now:
  - shows a band badge next to each account's lifecycle pill
  - shows effective headroom in the per-account meta line
  - shows a top-level banner with the exact contract action when the best account is in `checkpoint`, `forced-handoff`, or `stop-work`
- New scorer unit tests for `effectiveHeadroom`, `computeQuotaBand`, and `scoreAccount` band tagging across all bands

## Completed (previous sessions, kept for context)

- Phase 2 scoring engine + pick-best route + ranking UI (`53fd370`)
- Backend-first Devin session bootstrap (`src/lib/devinControlPlane.ts`, `connect-repo` route, account UI split between `Прошить репо` and `Старт`)
- `docs/supervisor-cloud-sync-contract.md` as the shared sync contract
- Aligned entry docs (`AGENTS.md`, `README.md`, `docs/cloud-agent-operating-model.md`)

## Git state

- Repository: `lumamax/devin-dashboard`
- Base branch: `main` at `fb314a1` (`feat(control-plane): add devin bootstrap sync contract`)
- Working branch: `devin/1778931733-quota-band-scoring`
- PR: open against `main` — see GitHub
- Safe to delete after merge: `devin/1778931733-quota-band-scoring`

## Validation

- `npm test` — 45/45 passing (was 35 before; 10 new scorer tests added)
- `npm run typecheck` — clean
- `npm run build` — clean
- `npm run lint` — not run (`next lint` has no ESLint config and prompts interactively; this matches the prior session's validation surface — only `npm test` + `npm run build` are part of the workflow)
- Environment fix discovered: on a fresh VM, `connectionStore.test.ts` fails with `sqlite3 ENOENT` because `listStoredAccounts` unconditionally probes `~/.omniroute/storage.sqlite`. Installing the `sqlite3` CLI and creating an empty `provider_connections` table makes the test pass. The repo blueprint should bake this so future sessions don't lose time on it.

## Architecture decisions

- `lifecycle` and `quotaBand` are intentionally separate signals:
  - `lifecycle` answers "can this account take work at all?" (active / needs-relink / rate-limited / errored / exhausted / draining)
  - `quotaBand` answers "where is this account in the checkpoint / handoff lifecycle per the sync contract?"
- The pick-best API surface stays additive — new fields appended to existing `ranked` rows, no field renamed or removed
- Operator banners come from the UI, not from the API — the API stays as a pure ranking surface
- Default forced-sync thresholds confirmed and now encoded in code:
  - `>20%` healthy
  - `≤20%` draining
  - `≤10%` checkpoint zone
  - `≤5%` forced handoff zone
  - `≤2%` stop-work zone
  - `≤0%` exhausted (disqualified)
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
- On a fresh VM, before `npm test` will pass cleanly:
  ```bash
  sudo apt-get install -y sqlite3
  mkdir -p ~/.omniroute
  sqlite3 ~/.omniroute/storage.sqlite "CREATE TABLE IF NOT EXISTS provider_connections (id TEXT PRIMARY KEY, provider TEXT, auth_type TEXT, name TEXT, priority INTEGER, is_active INTEGER, test_status TEXT, api_key TEXT, provider_specific_data TEXT, rate_limited_until TEXT, last_error TEXT, created_at TEXT, updated_at TEXT);"
  ```

## Next best action

Build on the band signal that now lives on every scored account:

- wire a server-side checkpoint-trigger surface that the supervisor (or a Devin cloud session at session-start) can hit to learn whether the working account is in checkpoint / forced-handoff / stop-work and act accordingly
- start tracking branch / ownership / handoff status per account in `providerSpecificData.devinDashboard` so the UI and pick-best route can show which account currently owns which write zone (closes the third operator-grade item from the previous handoff)
- consider fixing the pre-existing `listStoredAccounts` bug where `listStoredAccountsDirect` is called even when the OmniRoute API already returned data — this is what causes the sqlite probe to be required on a fresh VM
