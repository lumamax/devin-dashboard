# Independent Control Plane Plan

## Goal

Make Devin Dashboard usable as a standalone local product for macOS, Linux, and Windows users. It should not require OmniRoute, a specific local machine layout, or private LumaMax credentials.

## Product Contour

```text
User machine
  Devin Dashboard
    local account vault
    per-account browser profiles
    GitHub App broker
    quota watcher / supervisor

GitHub
  user-owned private repos
  user-owned GitHub App installation
  worker branches and PRs
  handoff docs

Devin
  cloud worker sessions
  one prepared repo per active session
```

## Storage Strategy

- Default storage is local: `DEVIN_DASHBOARD_STORE=local`.
- Default data dir is platform-aware:
  - macOS/Linux: `~/.devin-dashboard`
  - Windows: `%APPDATA%\devin-dashboard`
- The current vault file is `dashboard.json` for portability and simple debugging.
- Future hardening can add encrypted-at-rest storage without changing the higher-level account API.
- OmniRoute mode remains only for migration: `DEVIN_DASHBOARD_STORE=omniroute`.

## GitHub Access Strategy

Use a GitHub App as the long-term broker.

- The user creates their own GitHub App.
- The user installs it only on repos they want Devin workers to access.
- The dashboard mints short-lived installation tokens locally.
- Devin sessions receive clone commands for selected repos.
- GitHub App private keys never leave the user's machine.

PATs are acceptable only as a temporary manual fallback because they are broader, longer-lived, and harder to rotate safely across many workers.

## Worker Session Strategy

- One Devin account should keep one live prepared session per repo.
- The dashboard should not attach the same repo repeatedly to the same account.
- If a second repo is selected for the same account, it should create or use a separate session.
- Initial attach prompt should only clone and confirm availability unless the supervisor sends an explicit task.
- Follow-up work should target the existing session whenever possible, not spawn extra sessions by default.

## Supervisor Strategy

The supervisor can be local Codex now and a dedicated automation later.

Responsibilities:

- select an account with quota headroom
- choose repo and model
- start or reuse a prepared Devin session
- monitor quota thresholds
- require checkpoint and handoff when quota gets low
- sync results through git and handoff docs

Quota thresholds:

- `<=10%`: warn and prepare checkpoint
- `<=5%`: push branch and write handoff
- `<=2%`: stop new work and preserve state immediately

## Public Safety Requirements

The public repo must not contain:

- `.env.local`
- dashboard vaults
- Devin cookies or bearer tokens
- Chrome profiles
- GitHub App private keys
- installation tokens
- HAR files or browser traces
- screenshots with user IDs, tokens, emails, or repo secrets

Public docs should explain how users create their own GitHub App and local vault instead of referencing the LumaMax private setup as required infrastructure.

## Implementation Phases

### Phase 1: Storage Independence

- Add local dashboard store.
- Make local store the default.
- Keep OmniRoute only as explicit legacy mode.
- Add migration command.
- Remove secret previews from client payloads.

### Phase 2: User Setup

- Add `/setup/github-app` setup page.
- Update README, handoff, env example, and agent docs.
- Ensure `.gitignore` excludes local vaults and traces.

### Phase 3: Code Cleanup

- Split large account card code into smaller components.
- Move unused session inspector/debug panels behind a debug flag or delete them.
- Rename historical `omniroute` compatibility types to neutral account-summary names.

### Phase 4: Supervisor Productization

- Persist supervisor events in the local store.
- Show compact supervisor state in UI.
- Add safe cleanup of old worker branches.
- Add encrypted vault export/import for moving accounts between machines.

### Phase 5: Optional Integrations

- Reintroduce OmniRoute only as an integration once Devin routing is stable.
- Add provider-style routing later if OmniRoute can use Devin workers as a mature execution lane.
