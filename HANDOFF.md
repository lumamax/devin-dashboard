# HANDOFF

## What This Project Is

Devin Dashboard is a local, cross-platform control plane for multi-account Devin cloud work. It manages Devin accounts, tracks quota, prepares GitHub repositories through a GitHub App broker, and helps a supervisor pass work between cloud agents through git plus handoffs.

## Current Runtime

- Local app URL: `http://127.0.0.1:29128`
- Framework: Next.js 15 + React 18 + Tailwind
- Remote: `https://github.com/lumamax/devin-dashboard.git`
- Branch: `main`
- Default store: local dashboard vault at `DEVIN_DASHBOARD_HOME` or `~/.devin-dashboard`
- Legacy store mode: `DEVIN_DASHBOARD_STORE=omniroute` only for migration

## Current Product State

- Runtime OmniRoute dependency has been removed from the default path.
- Accounts are stored in a local cross-platform JSON vault.
- `connectionStore` defaults to local storage and keeps OmniRoute only as explicit legacy mode.
- The client account payload no longer includes bearer previews.
- The main dashboard copy now says `Local Control Plane`.
- A GitHub App setup page exists at `/setup/github-app` for public/user setup.
- GitHub App repo discovery still feeds the repo selection UI.
- Repo attach remains backend-first and sends the selected model into new Devin sessions.
- Prepared repos are persisted per account and duplicate attach is avoided for the same account/repo.
- Quota bars represent remaining headroom, not used percentage.

## Verification To Run

```bash
npm test
npm run typecheck
npm run build
```

## Important Files

- `src/lib/dashboardStore.ts`
- `src/lib/connectionStore.ts`
- `src/app/setup/github-app/page.tsx`
- `src/components/RepoBootstrapPanel.tsx`
- `src/components/AccountCard.tsx`
- `src/app/api/accounts/[id]/connect-repo/route.ts`
- `scripts/migrate-from-omniroute.ts`
- `docs/independent-control-plane-plan.md`
- `docs/cloud-agent-operating-model.md`
- `docs/supervisor-cloud-sync-contract.md`
- `docs/browser-profile-hygiene.md`

## Safety Boundary

Do not commit or upload live Devin session secrets. This repository intentionally excludes:

- live Devin cookies
- Bearer tokens
- dashboard vault files
- local OmniRoute SQLite data
- Chrome profile captures
- HAR files and browser traces
- GitHub App private keys and installation tokens

If fresh live access is needed, relink accounts locally through the dashboard.

## Recommended Next Steps

1. Run the full verification suite and fix any regressions from the storage split.
2. Finish removing or isolating old debug/session UI inside `AccountCard.tsx`.
3. Add encrypted export/import for moving the local vault between machines.
4. Discover a clean backend endpoint for posting a follow-up instruction into an existing Devin session.
5. Add the Devin browser profile janitor described in `docs/browser-profile-hygiene.md` so temporary Chrome profiles and code-sign clones do not accumulate.
6. Keep public docs scrubbed of private user IDs, emails, tokens, screenshots, and local session data.

## Notes For A Cloud Agent

Treat every Devin session as a fresh clone. Durable continuity is git plus handoff, not VM persistence. Read these first before implementation work:

1. `README.md`
2. `AGENTS.md`
3. `HANDOFF.md`
4. `docs/handoffs/LATEST.md`
5. `docs/cloud-agent-operating-model.md`
6. `docs/supervisor-cloud-sync-contract.md`
