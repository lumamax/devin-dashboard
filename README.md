# Devin Dashboard

Localhost-only companion app for [OmniRoute](https://github.com/diegosouzapw/OmniRoute).
Reads `devin-web` provider connections from OmniRoute and gives you a
multi-account dashboard for Devin (app.devin.ai):

- **Add Devin account (v0.2)** — opens a fresh Chrome window on
  app.devin.ai with an empty profile; you log in once and the dashboard
  auto-captures the `wos-session` cookie + the `Authorization` Bearer
  JWT + the `x-cog-org-id` header via CDP, then saves them to OmniRoute.
- **Open in Chrome** — relaunches that captured profile (per-account
  isolated Chrome user-data-dir under `~/.devin-dashboard/profiles/`).
- **Live quota readout (v0.2)** — for each account, calls
  `GET /api/{orgId}/billing/quota/usage` with the captured Bearer and
  shows daily / weekly ACU usage on the card.
- **Auto-extract cookie (legacy)** — pre-v0.2 path that reads
  `wos-session` directly from your day-to-day Chrome profile. Still
  works; useful if the auto-login wizard ever fails. Bearer can't be
  derived from a cookie file alone, so accounts added this way will show
  "needs re-link" in the quota panel until you re-add them via the wizard.

Sessions list + read-only event-stream chat ship in v0.3. Routing across
accounts (the "single UI, multiple accounts" question) — see
[`docs/routing-feasibility.md`](docs/routing-feasibility.md).

---

## Architecture

```
┌─────────────────┐         ┌─────────────────────────────┐
│ Browser (you)   │  HTTP   │ Devin Dashboard             │
│ localhost:29128 ┼────────▶│ (Next.js, localhost-only)   │
└─────────────────┘         │                             │
                            │ /api/accounts        ──────▶│ OmniRoute /api/providers
                            │ /api/accounts/add    ──────▶│  POST { provider: 'devin-web',
                            │   ↳ spawns Chrome           │           apiKey: JSON blob }
                            │     w/ --remote-debugging-  │
                            │     port=N + empty profile  │
                            │   ↳ CDP listens for first   │
                            │     Authorization Bearer    │
                            │ /api/accounts/:id/quota ──▶ │ app.devin.ai
                            │   ↳ GET .../billing/quota   │   /api/{orgId}/billing/...
                            │     /usage w/ stored Bearer │
                            │ /api/accounts/:id/launch    │
                            │   ↳ spawns Chrome w/        │
                            │     per-account user-data   │
                            └─────────────────────────────┘
```

Credentials never live on the dashboard's disk. They live in OmniRoute's
encrypted `provider_connections.apiKey` column, packaged as a versioned
JSON blob:

```json
{
  "version": 1,
  "kind": "devin-web-creds",
  "cookie": "wos-session=...; other=...",
  "bearer": "eyJhbGc...",
  "orgId": "org-...",
  "capturedAt": "2026-05-14T22:15:00.000Z"
}
```

On 401 the dashboard transparently calls `POST /api/users/post-auth` with
the stored cookie to refresh the Bearer, then re-saves it to OmniRoute.

## Setup

```bash
cd devin-dashboard
cp .env.example .env.local
# edit .env.local — set OMNIROUTE_URL and OMNIROUTE_TOKEN
npm install
npm run dev
```

Open <http://localhost:29128> → click **Add Devin account** → log in in
the Chrome window that appears → name the account → Save.

### Required env

| Variable          | Purpose                                                                |
| ----------------- | ---------------------------------------------------------------------- |
| `OMNIROUTE_URL`   | Where OmniRoute is running. Defaults to `http://localhost:20128`.      |
| `OMNIROUTE_TOKEN` | Management API key from OmniRoute (Settings → API Keys, "providers:read providers:write"). |

### Optional env

| Variable                | Purpose                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| `DEVIN_PROFILE_ROOT`    | Where per-account Chrome profiles are stored. Defaults to `~/.devin-dashboard/profiles`. |
| `CHROME_BINARY_PATH`    | Override Chrome binary location. Auto-detected per-OS by default.        |
| `CHROME_SOURCE_PROFILE` | Source profile for the legacy `/api/accounts/extract-cookie` route. Defaults to Chrome's `Default`. |

## Auto-login flow (v0.2)

When you click **Add Devin account**:

1. The dashboard spawns Chrome with `--user-data-dir=<temp>` and
   `--remote-debugging-port=<free>`. The temp profile is intentionally
   empty so Chrome doesn't reuse your day-to-day login.
2. The dashboard backend connects to Chrome via CDP
   (`chrome-remote-interface`), enables the Network domain, and listens
   for `requestWillBeSent` / `requestWillBeSentExtraInfo` events.
3. As soon as a request to `app.devin.ai/api/*` carries both an
   `Authorization: Bearer …` header and an `x-cog-org-id`, the dashboard
   captures the values plus the full cookie jar via
   `Network.getCookies`. Capture window: 10 minutes.
4. You name the account in the UI and click Save. Credentials are
   POST'd to OmniRoute as the JSON blob above.
5. The temp Chrome profile is kept (it now has your wos-session cookie
   set so the user can continue working) and re-used by **Open in
   Chrome** on that account's card.

## Auto-extract cookie (legacy) — platform notes

| Platform | Encryption                | What we read              | Requires                                  |
| -------- | ------------------------- | ------------------------- | ----------------------------------------- |
| macOS    | AES-128-CBC + PBKDF2(Keychain "Chrome Safe Storage") | `~/Library/Application Support/Google/Chrome/Default/Cookies` | Keychain prompt (one-time)                |
| Linux    | AES-128-CBC + PBKDF2(libsecret or "peanuts") | `~/.config/google-chrome/Default/Cookies` | `secret-tool` (`libsecret-tools`) + unlocked keyring |
| Windows  | AES-256-GCM + DPAPI       | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Network\Cookies` | PowerShell + same Windows user as Chrome  |

**Chrome must be fully quit** (no background helpers) before extraction —
the cookies SQLite file is locked while Chrome is running. The endpoint
returns a clear "sqlite_query_failed" error if so. The auto-login wizard
above doesn't have this limitation.


## GitHub App broker MVP

The repo now includes a local-only GitHub App broker scaffold:

- `GET /api/github-app/status` — configuration and installation diagnostics
- `POST /api/github-app/token` — mint a short-lived installation token
- `POST /api/github-app/bootstrap` — mint a token plus return clone/bootstrap commands for one repo

These endpoints are intended for localhost use only while the long-term control plane is being built.

## Security model

This dashboard is **localhost-only** and the dev / start scripts bind Next.js
to `localhost:29128` (not `0.0.0.0`). Do not expose it to the public.

- File-system access is required to read Chrome's cookies file (legacy
  extract path).
- Process spawn is required to launch Chrome (`--remote-debugging-port`
  on the auto-login path; opaque/no debug port on the per-account
  "Open in Chrome" path).
- CDP connection is local-only and ephemeral — closed as soon as the
  Bearer is captured.

## Tests

```bash
node --import tsx/esm --test tests/launcher.test.ts tests/connectionStore.test.ts tests/devinApi.test.ts tests/githubApp.test.ts
npx tsc --noEmit
npx next build
```

10 unit tests, all passing.

## Cloud-agent workflow

If this repo is being used as the current multi-account Devin pilot, start here:

- `AGENTS.md`
- `docs/cloud-agent-operating-model.md`
- `docs/multi-account-git-access.md`
- `docs/github-app-control-plane-plan.md`
- `docs/handoffs/LATEST.md`
- `docs/handoffs/TEMPLATE.md`
- `.github/PULL_REQUEST_TEMPLATE/devin_pr_template.md`

These files define how local supervision, cloud Devin agents, git continuity, seat-related constraints, GitHub App migration, and handoff discipline work in this contour.

## Roadmap

- **v0.2 (this release)** — Auto-login wizard, JSON-blob credential storage,
  live quota readout via `/api/{orgId}/billing/quota/usage`, 401 refresh
  via `/api/users/post-auth`.
- **v0.3** — Per-account session list (`/api/{orgId}/v2sessions`) and
  read-only event-stream chat (`/api/events/<devin-id>/stream`).
- **v0.4** — Pattern A in `docs/routing-feasibility.md` — task-level
  account picker. Needs Devin's `POST /api/sessions` shape, not in the
  current HAR.
- **v0.5 (research)** — Pattern B context handoff (text-only, no VM state).
