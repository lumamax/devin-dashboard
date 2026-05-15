# HANDOFF

## What This Project Is
A local-only Devin session dashboard for OmniRoute. It lets you add multiple Devin web accounts, capture session credentials from login, store them in OmniRoute as the `devin-web` provider, view live quota, and open the right account in a separate Chrome window.

## Current Runtime
- Local app URL: `http://127.0.0.1:29128`
- Framework: Next.js 15 + React 18 + Tailwind
- OmniRoute storage: `~/.omniroute/storage.sqlite`
- Provider id: `devin-web`
- Local-only contour: no VPS / no remote bridge changes

## Important Safety Boundary
Do not commit or upload live Devin session secrets. This repository intentionally excludes:
- live WorkOS / Devin cookies
- Bearer tokens
- local OmniRoute SQLite data
- Chrome profile captures
- HAR files
- Playwright temp output

If you need fresh live access, relink accounts locally through the dashboard and read from the local OmniRoute DB at runtime.

## What Works Now
- Add account flow launches a login window and captures Devin session credentials
- Accounts are stored in OmniRoute under `provider_connections` as `devin-web`
- Launch opens the selected account in its own Chrome window
- Quota panel reads:
  - `GET /api/{orgId}/billing/quota/usage`
  - `GET /api/{orgId}/billing/status`
- Model enrichment reads:
  - `GET /api/organizations/{orgId}/session-tags`
  - `GET /api/users/info`
- Fallback model labels currently surface known Devin tags from the live app bundle:
  - Opus 4.7
  - GPT-5.5
  - Fast
  - Lite

## Known Product State On 2026-05-16
- Local dashboard build succeeds
- `npm run typecheck` passes
- `npm run build` passes
- The dashboard is intended to run persistently via local launchd
- Live quota reset dates are available and already rendered
- Plan slug is available, for example `pro-trial`
- No verified public/local endpoint has been found yet for explicit trial end date
- Devin frontend bundle suggests billing objects may contain `started_at` and `current_period_end`, but the matching API route has not been identified yet

## Most Relevant Files
- `src/components/AccountCard.tsx`
- `src/components/AddAccountWizard.tsx`
- `src/app/api/accounts/add/route.ts`
- `src/app/api/accounts/[id]/quota/route.ts`
- `src/lib/captureLogin.ts`
- `src/lib/extractCookies.ts`
- `src/lib/connectionStore.ts`
- `src/lib/devinApi.ts`

## Recommended Next Steps
1. Finish desktop densification of account rows in `AccountCard.tsx`.
2. Keep plan separate from models in the UI.
3. Hide low-value service metadata like org / slot from the visible dashboard unless needed for debugging.
4. If trial expiry is important, continue tracing the Devin billing frontend to locate the subscription endpoint that backs `started_at` and `current_period_end`.
5. If more models should appear, inspect fresh live session-tags output or additional organization settings fields.

## Manual Validation
- Start locally with `npm install` then `npm run dev` or `npm run build && npm run start`
- Open `http://127.0.0.1:29128`
- Add a Devin account and complete login
- Confirm the account appears in the list
- Confirm quota loads
- Confirm `Открыть` launches the corresponding Chrome session

## Notes For A Cloud Agent
A cloud agent can continue product and UI work from this repo, but it will not have local Devin sessions by default. Treat live session capture and local DB access as environment-specific capabilities that must be re-established outside the repository.
