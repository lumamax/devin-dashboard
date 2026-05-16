
# GitHub App Control Plane Plan

## Objective

Build the long-term shared-repo access contour for multi-account Devin work around a private GitHub App, not around copied browser sessions, long-lived PATs, or shared SSH material.

The target outcome is:

- `lumamax` private GitHub remains the source of truth
- local supervisor or future control plane issues short-lived repo access to cloud agents
- each Devin account receives only the access needed for its current work window
- continuity stays in git plus handoff, not in browser or VM state

## Why this is the target design

The current shared Devin-org approach is blocked by seat allocation inside Devin.

A GitHub App avoids that seat dependency and gives a better security model than one global PAT or one shared SSH secret.

GitHub's model supports this directly:

- GitHub Apps should request only the minimum permissions needed
- installation access tokens can be narrowed to selected repositories
- installation access tokens expire after 1 hour
- webhook payloads should be validated with a webhook secret

## Target architecture

### Core components

1. GitHub App
   - owned by `lumamax`
   - private, installable only on the owning account unless requirements change
   - installed on selected private repositories under `lumamax`

2. Control plane or token broker
   - initially local supervisor-owned
   - later moveable into a dedicated repo or service such as `lumamax/devin-control`
   - holds the GitHub App private key
   - mints short-lived installation tokens for specific repo scopes
   - never shares the app private key with cloud agents

3. Devin Dashboard
   - remains the dispatcher and visibility layer
   - gains awareness of GitHub App installation state, token leases, repo grants, and sync health

4. Cloud Devin accounts
   - receive short-lived git credentials only for current work
   - clone and push over HTTPS using installation tokens
   - never hold the GitHub App private key

## Recommended ownership model

Register the GitHub App under the `lumamax` organization, not under a personal account.

Reason:

- ownership stays aligned with the canonical source of truth
- app ownership is less fragile than tying it to one human account
- operational handoff is cleaner if the supervisor role changes later

## Installation model

Install the app on selected repositories, not on all repositories by default.

Then narrow further per work assignment:

- select only the repos the installation should see
- when minting an installation token, optionally narrow again to a subset of repositories for that specific task

This matches GitHub's model where installation tokens can be scoped down to specific repositories that the installation already has access to.

## Authentication model

### App-side

The broker authenticates as the GitHub App by generating a JWT and exchanging it for an installation access token.

### Agent-side

The cloud agent uses only the installation access token.

Preferred git form:

```text
https://x-access-token:INSTALLATION_TOKEN@github.com/lumamax/REPO.git
```

The agent should treat the token as ephemeral and task-scoped.

## Token lifecycle

Installation access tokens expire after 1 hour.

That means the system must be designed around leases, not permanent secrets.

Recommended lifecycle:

1. supervisor assigns work to a Devin account
2. broker creates a token for the exact repo set and permission set needed
3. broker records lease metadata
4. token is injected into the agent bootstrap flow
5. token expires naturally or is revoked early if needed
6. next session gets a fresh token

### Important implication

Do not design the system around one token surviving an entire long-lived Devin history.

Design it so that:

- every new cloud session can be re-seeded from git plus handoff
- token refresh is a normal control-plane action
- failed or expired sessions are cheap to re-bootstrap

## Minimal first-pass permissions

Start with the smallest permission set that supports code work.

Suggested repository permissions for phase 1:

- `Contents: Read and write`
- `Pull requests: Read and write`
- `Issues: Read and write`
- `Metadata: Read-only`

Only add more if a concrete workflow needs them.

Likely later additions, only if required:

- `Actions: Read-only` for CI visibility
- `Checks: Read and write` for check runs
- `Commit statuses: Read and write` if the app must publish statuses itself

## Webhook strategy

Subscribe only to the events the control plane actually needs.

Recommended initial webhook set:

- `installation`
- `installation_repositories`
- `pull_request`
- `push`
- `issues`

Optional later:

- `pull_request_review`
- `check_suite`
- `check_run`
- `repository`

The webhook endpoint must validate `X-Hub-Signature-256` using the configured webhook secret before processing payloads.

## Broker responsibilities

The broker is the most sensitive part of the system.

It should own:

- GitHub App private key handling
- installation discovery
- repository grant policy
- installation token minting
- lease tracking
- revocation support
- audit logging

It should not own:

- business logic of a specific product repo
- long transcript history
- browser cookies
- long-lived agent-specific credentials

## Suggested broker API

Phase 1 can be private and local-only.

Suggested endpoints:

- `POST /github-app/installations/:installationId/token`
  - input: requested repos, requested permissions, ttl intent, task id, account id
  - output: installation token, expires_at, granted repos, granted permissions
- `POST /github-app/bootstrap`
  - input: account id, repo, branch, task id
  - output: clone URL, token, bootstrap commands, handoff pointers
- `POST /github-app/revoke`
  - input: lease id or token context
  - output: revoked status
- `GET /github-app/installations`
  - output: known installations and repo mappings
- `GET /github-app/leases`
  - output: active token leases and expiry times

## Suggested dashboard additions

The dashboard should eventually display:

- GitHub App installation status per repo
- token lease status per active Devin account
- token expiry timestamp
- last successful bootstrap timestamp
- repo grant set for the account's current task
- handoff target repo and branch
- repo sync health

This turns the dashboard into a proper dispatcher plus visibility layer without making it the durable source of truth.

## Build phases

## Phase 0: Canonical design and repo contract

Goal:

- freeze the GitHub App target architecture before implementation

Outputs:

- this plan document
- updated AGENTS and handoff docs
- explicit control-plane boundaries

Acceptance:

- the team has one canonical written design to hand to any next agent

## Phase 1: Register and install the private GitHub App

Goal:

- create the app and prove installation on selected `lumamax` repos

Tasks:

1. register a private GitHub App under `lumamax`
2. set homepage URL and setup URL placeholders
3. configure webhook URL placeholder and webhook secret
4. choose minimum repository permissions
5. install the app on one pilot repo first, preferably `lumamax/devin-dashboard`
6. confirm installation ID and repository mapping

Acceptance:

- the app exists
- it is installed on the pilot repo
- the installation ID is known and documented

## Phase 2: Local token broker MVP

Goal:

- mint installation tokens locally for one pilot repo

Tasks:

1. create a local-only broker module or service
2. load app credentials from secure local environment storage
3. generate app JWT
4. exchange JWT for installation token
5. allow optional repo narrowing
6. record lease metadata with expiry time

Acceptance:

- local supervisor can mint a working installation token for the pilot repo
- token expiry and scope are logged

## Phase 3: Devin bootstrap flow

Goal:

- seed one cloud Devin session using the brokered token

Tasks:

1. create a bootstrap recipe for cloud agents
2. pass repo URL plus short-lived token plus handoff pointers
3. clone the repo in a fresh Devin session
4. push a test branch or no-op docs branch
5. verify that the next session can re-bootstrap from scratch

Acceptance:

- one free Devin account can pull from the private repo without shared Devin-org seats
- a second fresh session can repeat the bootstrap from docs alone

## Phase 4: Dashboard integration

Goal:

- make the dashboard aware of GitHub App bootstrap and lease state

Tasks:

1. add installation inventory view
2. add bootstrap action for an account
3. add lease expiry readout
4. add repo assignment visibility
5. add revocation action for the supervisor

Acceptance:

- supervisor can see which account has which repo lease and when it expires

## Phase 5: Multi-repo and rotation policies

Goal:

- make the system ready for a real account pool

Tasks:

1. support selected repo sets per task
2. define revocation on account retirement
3. define draining behavior for accounts near quota exhaustion
4. connect lease state with handoff state
5. add audit events for token mint, use, and revoke

Acceptance:

- the system can route work across multiple active accounts without one permanent shared credential

## Security rules

- never place the GitHub App private key in any cloud Devin account
- store the app private key in a secure local secret store or vault-backed environment
- validate all webhook signatures before processing payloads
- keep the app private, not publicly installable, unless there is a future requirement
- subscribe only to the webhook events that are actually needed
- request only the minimum repository permissions required
- prefer narrow, per-task installation tokens over broad default tokens
- log issuance, expiry, and revocation events

## Open design questions

These should be answered during implementation, not left implicit:

1. Where should the broker live initially?
   - inside the current dashboard app
   - inside local OmniRoute-adjacent infrastructure
   - in a dedicated future repo such as `lumamax/devin-control`

2. What is the bootstrap surface for cloud agents?
   - direct token injection into Devin secrets
   - one-time bootstrap command returned by the broker
   - short-lived bootstrap manifest file

3. How should token refresh work for tasks that exceed one hour?
   - re-bootstrap on next session only
   - explicit supervisor refresh
   - automated short-cycle refresh while the task is still active

4. What audit detail is enough for the pilot?
   - lease id
   - account id
   - repo set
   - branch
   - task id
   - expiry timestamp

## Recommended immediate next step

Do not start by wiring the whole dashboard.

Start with the smallest vertical slice:

1. register the private GitHub App under `lumamax`
2. install it on `lumamax/devin-dashboard`
3. build a local token-minting script or tiny broker endpoint
4. prove one free Devin account can clone the pilot repo with a short-lived installation token
5. then integrate that flow into the dashboard

## References

Official references used for this plan:

- GitHub App registration: https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app
- Choosing permissions for a GitHub App: https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app
- Authenticating as an installation: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
- Generating a private key for a GitHub App: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps
- Validating webhook deliveries: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries

## Canonical summary

The long-term target contour is:

- `GitHub App under lumamax`
- `short-lived installation tokens`
- `local supervisor or broker owns the private key`
- `cloud agents receive only ephemeral task-scoped access`
- `continuity remains git plus handoff`
