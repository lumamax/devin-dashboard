# Cloud-Agent Operating Model

## What this repo is

This repository is the current pilot control plane for multi-account Devin execution.

The goal is not to preserve one Devin VM forever. The goal is to let multiple Devin cloud agents continue the same delivery contour through:

- a shared private GitHub source of truth
- clear handoffs
- disciplined branch / PR state
- supervisor routing between accounts with available quota

## Roles

### Local supervisor

Local Codex is currently the supervisor.

It owns:

- local OmniRoute
- local dashboard
- local Chrome / browser state
- unpublished local code
- account routing decisions
- recovery when a cloud session is blocked by quota or missing access

### Cloud Devin agents

Cloud Devin agents are remote execution workers.

They should:

- read the current handoff
- pull the latest git state
- do scoped implementation work
- open or update PRs
- write a clean handoff for the next cloud agent

They should not assume they can inherit a previous VM's filesystem, browser, or shell state.

## Source of truth

The durable source of truth is private GitHub under `lumamax`.

This means continuity is carried by:

1. repository state
2. branch state
3. PR state
4. handoff notes

It is not carried by hidden VM state.

## Immediate recommendation

### Short-term pilot

Use `lumamax/devin-dashboard` as the current pilot repo for the cloud-agent workflow because:

- it already contains the multi-account dispatcher work
- it already has active Devin context
- it is the fastest path to validate cross-account handoff discipline

### Medium-term structure

Split the system into two layers:

1. control-plane repo
   Suggested future name: `lumamax/devin-control`
   Purpose: operating model, handoffs, routing rules, supervisor notes, shared prompts
2. work repos
   Examples: `lumamax/devin-dashboard`, `lumamax/OmniRoute`, other product repos

That lets all cloud agents share one operational brain while still coding in separate product repos.

## Why some Devin accounts currently cannot see the target repo

The free accounts with available quota are currently connected to different GitHub installations, not to the `lumamax` GitHub owner.

So even though those Devin accounts have valid GitHub integrations, they do not automatically see `lumamax` private repositories.

This is a Git integration contour issue, not a quota issue.

## Correct way to give a Devin account access to the shared private repo

For each Devin account that should work on the shared contour:

1. Connect the Devin account's GitHub integration to the `lumamax` GitHub owner, not to a separate per-account GitHub identity.
2. In GitHub App configuration, grant the Devin app access to the specific `lumamax` repositories that the account should use.
3. In Devin, go to `Settings -> Devin's Environment -> Repositories` and add the repo.
4. Clone and configure the repo in the environment so future sessions boot with the repo available.

Official references:

- Devin GitHub integration: https://docs.devin.ai/integrations/gh
- Devin repository setup: https://docs.devin.ai/onboard-devin/new-repo-setup
- Devin environment configuration: https://docs.devin.ai/onboard-devin/environment
- Devin AGENTS.md support: https://docs.devin.ai/onboard-devin/agents-md

## Session policy

When starting a new cloud session:

1. Read `AGENTS.md`
2. Read `docs/handoffs/LATEST.md`
3. Confirm repo access exists
4. Confirm which branch / PR / task is current
5. Prefer `Opus 4.7`, then `Max`, then `xhide` if available
6. Work only against the shared git contour
7. Before pausing, update the handoff

## Handoff policy

A good handoff is short, factual, and actionable.

It should include:

- what problem was being solved
- what changed
- what git state exists now
- what remains open
- what the next agent should do first

It should not be a raw transcript dump.

## Current pilot state

At the moment:

- old Devin context exists in a suspended session that hit quota
- continuity must move into a new session on an account with free weekly quota
- `ghoulgpt4` and `ghoulgpt5` currently have quota headroom
- those accounts still need the correct `lumamax` repo access contour before they can continue work on the shared private repo
