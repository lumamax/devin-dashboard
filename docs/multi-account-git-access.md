# Multi-Account Git Access Model

## Status

As of May 16, 2026, the multi-account Devin pilot has a confirmed access constraint:

- A free Devin account can be routed into the `lumamax` GitHub owner selection flow.
- The join request to the `lumamax` Devin organization can be approved.
- After approval, the routed account lands on `No seat allocated` inside the `lumamax` Devin org.

That means a shared Devin-org model is currently blocked by Devin seat allocation, not by GitHub cookies and not by broken GitHub auth.

## What was proven

The following path was tested end to end:

1. Open a free account with available quota, such as `ghoulgpt4`.
2. Start Devin GitHub connect flow.
3. Select `lumamax` in the GitHub owner flow.
4. Submit the Devin-org join request.
5. Approve that request from the `lumamax` admin side.
6. Re-enter `lumamax` from the free account.

Result:

- the account becomes a member of the `lumamax` Devin org
- the account still cannot run there without an allocated seat
- the UI shows `No seat allocated`

## Decision

For the current pilot, do not make shared Devin-org membership the primary access model.

Use this instead:

- private GitHub under `lumamax` remains the source of truth
- local Codex remains the supervisor
- Devin Dashboard remains the account dispatcher
- cloud Devin accounts get repo access through shared machine credentials, not through inherited GitHub web sessions

## Recommended v1

### Machine user plus per-account SSH keys

Use one dedicated GitHub machine user, for example `lumamax-bot`.

For each active Devin account:

1. generate a unique SSH keypair for that account
2. add the public key to `lumamax-bot`
3. add `lumamax-bot` to the required private repos or team
4. store the matching private key in that Devin account's secrets
5. clone and push through SSH from the Devin environment

Why this is the recommended v1:

- works across many repos
- works across many Devin accounts
- does not depend on Devin seats
- does not depend on GitHub browser cookies
- lets us revoke one account cleanly without breaking the rest

## Why not deploy keys

Repository deploy keys are fine when one bot needs access to one repo.

They are a poor fit for this pilot because:

- one deploy key is bound to one repo
- many active Devin accounts would require a large matrix of keys
- revocation and rotation become more annoying as repo count grows
- they do not express a shared bot identity across the whole private contour

## Why not one shared PAT

A single shared PAT is fast to start with, but it is not the preferred operating model here.

Reasons:

- one leaked token affects every active Devin account
- rotation is painful because all accounts break together
- it is harder to reason about per-account revocation
- it encourages one broad secret instead of narrow isolated credentials

If a PAT is ever used as a temporary bridge, prefer a fine-grained PAT, scope it to selected repos only, and plan to replace it with per-account SSH or a GitHub App flow.

## Recommended v2

### GitHub App plus token broker

Long-term, the cleanest model is:

- a GitHub App installed on the `lumamax` owner
- local supervisor or control plane issues short-lived installation tokens to active cloud agents
- each cloud agent receives only the token needed for the current work window

That is the best future state. The detailed build plan now lives in `docs/github-app-control-plane-plan.md`.

## Account lifecycle

Do not treat dashboard deletion as the first step.

Use explicit lifecycle states:

- `active`: healthy account, can receive work
- `draining`: still usable, but do not assign long-running new work
- `exhausted`: quota or operating capacity is spent, stop routing new work
- `retire_pending`: waiting for cleanup and final handoff
- `revoking`: access is being removed
- `retired`: no longer active, kept for audit/history
- `archived`: hidden from normal dashboard view

### Retirement flow

When an account should leave the active pool:

1. finish or hand off any in-flight work
2. commit and push the latest git state
3. update `docs/handoffs/LATEST.md`
4. remove repo access or secrets from the Devin environment if needed
5. revoke only that account's SSH key from `lumamax-bot`
6. mark the dashboard record `retired` or `archived`

This keeps the system auditable and avoids deleting state before access is actually revoked.

## Dashboard implications

The dashboard should eventually track more than raw quota.

Recommended fields:

- account status
- weekly quota used
- daily quota used
- quota reset timestamps when available
- plan expiry when available
- preferred model availability
- git access status
- SSH key fingerprint or credential label
- last handoff commit or branch
- last successful repo sync

## How to transfer work to another Devin

The next Devin account does not need the old VM.

It needs:

1. access to the same private repo
2. the latest remote git state
3. `AGENTS.md`
4. `docs/cloud-agent-operating-model.md`
5. this file
6. `docs/handoffs/LATEST.md`

A private repo URL by itself is not enough. The receiving Devin account must also have working git credentials for that private repo.

## Canonical summary

The current canonical operating model is:

- continuity is carried by git plus handoff, not by VM persistence
- Devin Dashboard is a dispatcher, not the source of truth
- shared Devin-org access is blocked by seats on the current plan
- the practical near-term solution is `machine user + per-account SSH keys`
- the target long-term build contour is the GitHub App control plane in `docs/github-app-control-plane-plan.md`
