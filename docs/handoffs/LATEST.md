# Latest Handoff

## Task

Continue `lumamax/devin-dashboard` as the standalone Devin control-plane repo for multi-account cloud work.

Current focus:

- remove runtime OmniRoute dependency
- make storage cross-platform and local-first
- keep GitHub App as the long-term repo access broker
- prepare the repo for public/user setup without leaking private data

## Completed

- Added local dashboard store under `src/lib/dashboardStore.ts`.
- Made `connectionStore` default to `DEVIN_DASHBOARD_STORE=local`.
- Kept OmniRoute only as explicit legacy mode for migration.
- Added `scripts/migrate-from-omniroute.ts` and `npm run migrate:omniroute`.
- Removed bearer previews from account API/page payloads.
- Added neutral `accountSummary` types and moved visible status copy to `Local Control Plane`.
- Added `/setup/github-app` for user-facing GitHub App setup.
- Added `docs/pat-bootstrap.md` for a safe fine-grained PAT fallback flow.
- Updated `.env.example`, `.gitignore`, `README.md`, `HANDOFF.md`, and `AGENTS.md` for the independent contour.

## Verification

Run before continuing:

```bash
npm test
npm run typecheck
npm run build
```

## Current Operator Rules

- Durable continuity is GitHub plus handoff, not Devin VM state.
- A prepared repo should not be attached repeatedly to the same account.
- Initial repo attach should clone and then wait unless a task is explicitly included.
- GitHub App private keys stay local and are never sent to Devin.
- Quota bars represent remaining headroom, not used percentage.

## Important Context For The Next Agent

Read these first:

1. `README.md`
2. `AGENTS.md`
3. `HANDOFF.md`
4. `docs/independent-control-plane-plan.md`
5. `docs/cloud-agent-operating-model.md`
6. `docs/supervisor-cloud-sync-contract.md`
7. `docs/github-app-control-plane-plan.md`
8. `docs/pat-bootstrap.md`

Check these implementation files next:

- `src/lib/dashboardStore.ts`
- `src/lib/connectionStore.ts`
- `src/app/setup/github-app/page.tsx`
- `src/components/RepoBootstrapPanel.tsx`
- `src/components/AccountCard.tsx`
- `src/app/api/accounts/[id]/connect-repo/route.ts`
- `scripts/migrate-from-omniroute.ts`

## Next Best Actions

1. Run verification and fix any regressions.
2. Finish splitting or deleting old session-inspector code from `AccountCard.tsx`.
3. Add encrypted export/import for moving local dashboard vaults between machines.
4. Discover the clean backend endpoint for sending follow-up instructions into an existing Devin session.
