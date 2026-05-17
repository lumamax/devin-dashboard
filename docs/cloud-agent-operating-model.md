# Cloud-Agent Operating Model

## What This Repo Is

This repository is the current pilot control plane for multi-account Devin execution.

The goal is not to preserve one Devin VM forever. The goal is to let multiple Devin cloud agents continue one delivery contour through:

- a shared private GitHub source of truth
- clear handoffs
- disciplined branch and PR state
- supervisor routing between accounts with available quota

## Roles

### Local Supervisor

Local Codex is currently the supervisor.

It owns:

- the local dashboard
- the local account vault
- GitHub App broker configuration
- local browser/profile state
- account routing decisions
- recovery when a cloud session is blocked by quota or missing access

### Cloud Devin Agents

Cloud Devin agents are remote execution workers.

They should:

- clone the repo from the dashboard-provided bootstrap prompt
- read the current handoff
- pull the latest git state
- do scoped implementation work only after explicit tasking
- open or update PRs when requested
- write a clean handoff for the next cloud agent

They should not assume they can inherit a previous VM filesystem, browser, or shell state.

## Source Of Truth

The durable source of truth is private GitHub.

Continuity is carried by:

1. repository state
2. branch state
3. PR state
4. handoff notes

It is not carried by hidden VM state.

## Recommended Shared-Repo Access Model

The target path is GitHub App access:

- one user-owned GitHub App
- installation scoped to selected repositories
- short-lived installation tokens minted locally by the dashboard
- clone/bootstrap prompt sent to the chosen Devin account

PATs or machine-user SSH keys can be used as temporary fallbacks, but the long-term contour should stay GitHub App first.

## Private Repo Access Rule

A private repo URL alone does not transfer access.

Any new cloud Devin account must have both:

1. the repo URL
2. working git credentials for that private repo

Without both, the next agent cannot continue the shared contour.

## Session Policy

When starting a new cloud session:

1. Clone the selected repo from the dashboard prompt.
2. Confirm the repo exists locally.
3. Read `AGENTS.md`.
4. Read `HANDOFF.md`.
5. Read `docs/handoffs/LATEST.md`.
6. Confirm which branch, PR, and task are current.
7. Prefer `Opus 4.7`, then `Max`, then `xhide` if available.
8. Work only against the shared git contour.
9. Before pausing, update the handoff.
10. Follow `docs/supervisor-cloud-sync-contract.md` for milestone sync and multi-session rules.

Initial repo attach should only clone and wait unless the supervisor explicitly includes a task.

## Parallel Session Rule

Multiple Devin sessions may work on one repository only when branch ownership and write ownership are explicit.

Safe pattern:

- one scoped task per session
- one branch per session
- disjoint write surface or clearly ordered dependency

Unsafe pattern:

- two sessions editing the same file group
- two sessions pushing to the same task branch
- two sessions racing the same release or migration step

If ownership is not explicit, the supervisor must serialize the work.

## Handoff Policy

A good handoff is short, factual, and actionable.

It should include:

- what problem was being solved
- what changed
- what git state exists now
- what remains open
- what the next agent should do first

It should not be a raw transcript dump.

## Current Pilot State

- `devin-dashboard` is being converted into an independent local control plane.
- Runtime account storage now defaults to the dashboard's own local vault.
- GitHub App is the intended long-term repository broker.
- OmniRoute is optional legacy/migration infrastructure, not the default runtime dependency.
