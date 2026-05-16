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

## Confirmed access constraint

The free accounts with available quota can be routed into the `lumamax` GitHub owner flow, but the shared Devin-org path is currently blocked by seat allocation.

The tested path was:

1. start GitHub connect flow on a free account such as `ghoulgpt4`
2. select `lumamax`
3. submit join request
4. approve the request from the `lumamax` admin side
5. re-enter the `lumamax` Devin org from that free account

Result:

- GitHub auth was not the blocker
- the account joined the Devin org
- the account then landed on `No seat allocated`

So the blocker is seat allocation inside Devin, not broken cookies and not a missing GitHub login.

## Recommended shared-repo access model

For the pilot, do not rely on shared Devin-org membership as the primary way to give every free account repo access.

Use:

- one shared private GitHub source of truth
- one machine user for code access, for example `lumamax-bot`
- one SSH keypair per active Devin account
- per-account secret storage inside Devin
- git continuity plus handoff discipline

See `docs/multi-account-git-access.md` for the detailed decision record.

## Private repo access rule

A private repo URL alone does not transfer access.

Any new cloud Devin account must have both:

1. the repo URL
2. working git credentials for that private repo

Without both, the next agent cannot continue the shared contour.

## Session policy

When starting a new cloud session:

1. Read `AGENTS.md`
2. Read `docs/cloud-agent-operating-model.md`
3. Read `docs/multi-account-git-access.md`
4. Read `docs/handoffs/LATEST.md`
5. Confirm repo access exists
6. Confirm which branch / PR / task is current
7. Prefer `Opus 4.7`, then `Max`, then `xhide` if available
8. Work only against the shared git contour
9. Before pausing, update the handoff

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
- shared Devin-org access to `lumamax` is blocked by seat allocation on the current plan
- the practical path forward is `machine user + per-account SSH keys`

## References

- Devin GitHub integration: https://docs.devin.ai/integrations/gh
- Devin repository setup: https://docs.devin.ai/onboard-devin/new-repo-setup
- Devin environment configuration: https://docs.devin.ai/onboard-devin/environment
- Devin AGENTS.md support: https://docs.devin.ai/onboard-devin/agents-md
