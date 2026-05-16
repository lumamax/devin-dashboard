# HANDOFF

## What This Project Is
A local-only Devin control plane for OmniRoute. It manages multiple Devin web accounts, tracks live quota, shows prepared repos, and can bootstrap repo access into Devin sessions through a backend-first flow.

## Current Runtime
- Local app URL: `http://127.0.0.1:29128`
- Framework: Next.js 15 + React 18 + Tailwind
- Remote: `https://github.com/lumamax/devin-dashboard.git`
- Branch: `main`
- OmniRoute storage: `~/.omniroute/storage.sqlite`
- Provider id: `devin-web`

## Current Product State On 2026-05-16
- Accounts are ordered with live quota first and exhausted/problematic accounts lower.
- The dashboard now uses a denser desktop layout with a compact left rail and cleaner account cards.
- End-user session internals are hidden from the visible UI; backend session state is still used internally.
- GitHub App repos are selected from a real repo list and stored as a multi-select queue.
- Model selection for new sessions is global in the left rail and sent into repo attach for new Devin sessions.
- Prepared repos are persisted per account and shown directly in each card.
- Quota bars show remaining headroom, not used percentage:
  - `100%` means full remaining quota
  - `0%` means quota exhausted
- Daily reset dates are already surfaced when the Devin billing payload provides them.

## What Works Now
- Add account flow launches a login window and captures Devin session credentials.
- Chrome import can pull already logged-in Devin sessions into the local list.
- Accounts are stored in OmniRoute under `provider_connections` as `devin-web`.
- `connect-repo` can attach a selected repo and chosen model through the backend-first control-plane flow.
- Previously prepared repos are remembered and avoid duplicate attach for the same account/repo combination.
- Launch opens the most relevant prepared Devin session when possible.
- GitHub App repo discovery is live and feeds the repo selection UI.

## Verification
- `npm test` — passing
- `npm run typecheck` — passing
- `npm run build` — passing
- Wide-screen visual check captured at `/private/tmp/devin-dashboard-shots/final-pass-3.png`

## Important Files
- `src/app/page.tsx`
- `src/components/AccountCard.tsx`
- `src/components/AddAccountWizard.tsx`
- `src/components/RepoBootstrapPanel.tsx`
- `src/app/api/accounts/[id]/connect-repo/route.ts`
- `src/lib/activeRepo.ts`
- `src/lib/accountOrdering.ts`
- `src/lib/dashboardRepoState.ts`
- `src/lib/sessionPolicy.ts`
- `docs/cloud-agent-operating-model.md`
- `docs/supervisor-cloud-sync-contract.md`

## Safety Boundary
Do not commit or upload live Devin session secrets. This repository intentionally excludes:
- live Devin cookies
- Bearer tokens
- local OmniRoute SQLite data
- Chrome profile captures
- HAR files and temporary browser traces

If fresh live access is needed, relink accounts locally through the dashboard.

## Recommended Next Steps
1. Keep polishing the desktop UI only after checking large-monitor density first.
2. Continue moving attach / routing behavior to pure backend flows where possible.
3. Discover a clean backend endpoint for posting a follow-up instruction into an already running Devin session.
4. If desired, remove or simplify now-unused visible-session UI helpers inside `AccountCard.tsx` to reduce code surface.
5. Keep the repo handoff contract factual and short: results, git state, next action.

## Notes For A Cloud Agent
Treat every Devin session as a fresh clone. Durable continuity is git + handoff, not VM persistence. Read these first before doing implementation work:
1. `README.md`
2. `AGENTS.md`
3. `HANDOFF.md`
4. `docs/handoffs/LATEST.md`
5. `docs/cloud-agent-operating-model.md`
6. `docs/supervisor-cloud-sync-contract.md`
