# Latest Handoff

## Task

Continue `lumamax/devin-dashboard` as the active control-plane pilot for multi-account Devin work.

The active objective is to turn stored accounts into interchangeable cloud workers that can continue one shared git contour with handoffs, repo bootstrap, and quota-aware routing.

## Completed

- Everything from the previous handoff (commit `1a48b49`) remains intact.
- Added `pick-best-account` control-plane path (Phase 2 from `docs/devin-control-plane-target.md`):
  - `src/lib/accountScorer.ts` — scoring engine that evaluates accounts on three dimensions:
    - quota headroom (daily + weekly, 0-50 points)
    - lifecycle state: active / draining / errored / needs-relink / rate-limited / exhausted (0-30 points)
    - repo readiness: whether the account already has the target repo assigned (0-20 points)
  - `GET /api/accounts/pick-best?targetRepo=owner/repo` — API route that fetches all stored accounts, enriches each with live quota data via the Devin billing API, scores them, and returns a ranked list with the best pick highlighted.
  - `src/components/PickBestAccountPanel.tsx` — dashboard UI panel with target repo input, score button, best-account highlight, and expandable full ranking table showing lifecycle badges and score breakdowns.
  - `tests/accountScorer.test.ts` — 10 unit tests covering all scoring dimensions, lifecycle transitions, ranking order, and edge cases.
- Integrated the panel into `src/app/page.tsx` between the repo bootstrap panel and the accounts list.

## Git state

- Repository: `lumamax/devin-dashboard`
- Branch: `devin/1778921979-pick-best-account` (PR into `main`)
- Base commit on `main`: `24c5af7`
- Remote: `origin https://github.com/lumamax/devin-dashboard.git`

## Validation

- `npm test` — 32/33 passing (1 pre-existing failure: `connectionStore.test.ts` needs `sqlite3` binary not present on cloud VM)
- `npm run typecheck` — passing
- `npm run build` — passing, new `/api/accounts/pick-best` route visible in build output

## Architecture decisions

- All previous architecture decisions remain unchanged.
- The scoring engine is intentionally simple and deterministic — no ML, no external state. Weights can be tuned later.
- Disqualification is binary: accounts missing creds, rate-limited, or fully exhausted get score 0 and sort to the bottom.
- The `draining` lifecycle (weekly quota <= 10%) is a soft warning, not a disqualification — the supervisor can still pick it if no better option exists.
- Repo readiness gives a 20-point boost to accounts already assigned to the target repo, reducing friction for the supervisor.

## Important context for the next agent

- The scoring weights (quota: 50, lifecycle: 30, repo: 20) are initial values. Adjust based on real-world usage patterns.
- The `pick-best` endpoint calls the Devin billing API for every account in parallel. With many accounts this could be slow; consider caching quota data with a short TTL if latency becomes a problem.
- The panel fetches on mount and on button click. It does not auto-refresh.

## Key docs to read first

1. `README.md`
2. `AGENTS.md`
3. `docs/cloud-agent-operating-model.md`
4. `docs/devin-control-plane-target.md`
5. `docs/multi-account-git-access.md`
6. `docs/github-app-control-plane-plan.md`

## Next best action

Build controlled task handoff into a new Devin session (Phase 3 from `docs/devin-control-plane-target.md`):

- generate a bootstrap prompt from the current repo state and latest handoff
- attach repo assignment cleanly to the chosen account
- open a new Devin session on the best-scoring account with the bootstrap prompt pre-filled
- resume work in the new account when the current one runs out of quota
