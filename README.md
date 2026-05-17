# Devin Dashboard

Local Devin control plane for running multiple Devin accounts as cloud workers against shared GitHub repositories.

The dashboard is designed to run on macOS, Linux, or Windows as a localhost app. It stores account metadata and captured Devin web credentials in a local dashboard vault, tracks quota, prepares repos through a GitHub App broker, and gives a supervisor one compact place to route work between cloud agents.

## What It Does

- Adds Devin accounts through a fresh Chrome login window or by importing already-open Chrome profiles.
- Stores accounts in a local cross-platform vault under `DEVIN_DASHBOARD_HOME` instead of requiring OmniRoute.
- Reads live Devin quota and model tags from Devin backend APIs using locally stored credentials.
- Lists GitHub App installation repositories and lets the user select which repo to prepare.
- Starts a Devin backend session with an attach-only prompt that clones the selected repo and then waits.
- Keeps prepared repos per account so the same repo is not repeatedly attached to the same session.
- Provides supervisor/watch scripts and handoff docs for quota-aware work transfer between agents.

## Architecture

```text
Local machine
  Devin Dashboard (Next.js, localhost:29128)
    local vault: ~/.devin-dashboard/dashboard.json
    account Chrome profiles: ~/.devin-dashboard/profiles/
    GitHub App broker: short-lived installation tokens
    supervisor watcher: quota and handoff nudges

GitHub
  private repositories
  GitHub App installation
  worker branches / PRs / handoff docs

Devin accounts
  account A -> one prepared repo/session
  account B -> next prepared repo/session
  account C -> standby / rotation
```

OmniRoute is no longer a runtime dependency. Legacy OmniRoute-backed account rows can still be migrated with `npm run migrate:omniroute`.

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://127.0.0.1:29128](http://127.0.0.1:29128).

The default local store works without extra env:

```bash
DEVIN_DASHBOARD_STORE=local
```

Optional local paths:

```bash
DEVIN_DASHBOARD_HOME=/path/to/devin-dashboard-data
DEVIN_DASHBOARD_STORE_PATH=/path/to/dashboard.json
DEVIN_PROFILE_ROOT=/path/to/profiles
CHROME_BINARY_PATH=/path/to/chrome
CHROME_SOURCE_PROFILE=/path/to/chrome/profile
```

## GitHub App Broker

The repo-access contour is GitHub App first, not PAT first.

Add these values to `.env.local` after creating and installing your own GitHub App:

```bash
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_PRIVATE_KEY_BASE64=
GITHUB_APP_INSTALLATION_ID=
GITHUB_APP_OWNER=
GITHUB_APP_WEBHOOK_SECRET=
```

Use the in-app setup page for the full flow:

[http://127.0.0.1:29128/setup/github-app](http://127.0.0.1:29128/setup/github-app)

Minimal recommended repository permissions:

- `Metadata: read`
- `Contents: read/write`
- `Pull requests: read/write` if agents should open PRs

Never send the GitHub App private key to Devin. The local dashboard mints a short-lived installation token and places it only inside the one-time clone command given to the worker session.

## Account Flow

When you click `Add Devin`:

1. Dashboard launches Chrome with a fresh profile and a local debugging port.
2. You log into Devin in that window.
3. Dashboard captures the Devin cookie, bearer token, and org id from local browser traffic.
4. Dashboard saves the account to the local vault.
5. `Open` reopens the same account profile later.

The Chrome import path scans existing local Chrome profiles for Devin auth. It is convenient, but platform cookie decryption may require OS tools such as Keychain, libsecret, PowerShell, `sqlite3`, or `strings`.

## Cloud-Agent Contract

The durable source of truth is GitHub plus concise handoff files, not a Devin VM.

Every cloud Devin worker should:

- clone the selected repo from the prompt provided by the dashboard
- read `AGENTS.md`, `HANDOFF.md`, and `docs/handoffs/LATEST.md`
- work on a scoped branch or PR
- push before quota gets low
- update the handoff before pausing, switching accounts, or ending work

Quota policy:

- `<=10%` effective remaining quota: checkpoint soon
- `<=5%`: push and hand off
- `<=2%`: stop new implementation work

## Migration From Legacy OmniRoute Storage

If you previously stored accounts as OmniRoute `devin-web` providers:

```bash
DEVIN_DASHBOARD_STORE=omniroute \
OMNIROUTE_URL=http://localhost:20128 \
OMNIROUTE_TOKEN=... \
npm run migrate:omniroute
```

After migration, switch back to:

```bash
DEVIN_DASHBOARD_STORE=local
```

## Security Boundary

This app is localhost-only and should not be exposed on a public interface.

Do not commit or publish:

- `.env.local`
- dashboard vault files
- Devin cookies or bearer tokens
- Chrome profiles
- HAR files, traces, screenshots with secrets
- GitHub App private keys or installation tokens

The repo `.gitignore` excludes common local vault and trace paths, but still review `git status` before publishing.

## Development

```bash
npm test
npm run typecheck
npm run build
```

Supervisor helpers:

```bash
npm run supervisor:once
npm run supervisor:watch
```

Important docs:

- `AGENTS.md`
- `HANDOFF.md`
- `docs/independent-control-plane-plan.md`
- `docs/pat-bootstrap.md`
- `docs/cloud-agent-operating-model.md`
- `docs/supervisor-cloud-sync-contract.md`
- `docs/handoffs/LATEST.md`
- `docs/handoffs/TEMPLATE.md`
