# AGENTS.md

## Role model

This repository is currently the pilot control plane for multi-account Devin work.

- Local Codex is the supervisor. It has access to the local Mac, Chrome sessions, OmniRoute, the localhost dashboard, and the shared workspace.
- Cloud Devin sessions are execution agents. They should treat GitHub plus the handoff files in this repo as the source of truth.
- The Devin Dashboard is only an account dispatcher and visibility layer. It is not the durable source of project state.

## Source of truth

- Durable state lives in private GitHub under `lumamax`.
- Session-to-session continuity must be carried by:
  1. git state
  2. concise handoff notes
  3. explicit next actions
- Do not assume a previous Devin VM still exists or that its filesystem state is recoverable.
- Do not rely on raw chat transcript as the primary continuity mechanism. Summarize outcomes, decisions, blockers, and exact git state instead.

## Model preference

When the account allows model selection:

1. Prefer `Opus 4.7`
2. Else use `Max`
3. Else use `xhide`
4. Else use the strongest available coding model and state the fallback clearly in the handoff

## Before starting work

Read these files first:

1. `README.md`
2. `docs/cloud-agent-operating-model.md`
3. `docs/devin-control-plane-target.md`
4. `docs/multi-account-git-access.md`
5. `docs/github-app-control-plane-plan.md`
6. `docs/handoffs/LATEST.md`
7. `docs/handoffs/TEMPLATE.md`

If repo access is missing, stop immediately and report:

- which Devin account/org you are running under
- which GitHub account, machine user, or installation is currently connected
- which repository is missing
- whether the blocker is repo permissions, repo setup, secrets, or environment setup

## Working rules for cloud agents

- Work from the latest remote git state, not from assumptions about prior VM state.
- Keep changes scoped to the active task.
- Prefer small PRs with explicit summaries over large silent rewrites.
- If you are blocked by local-only infrastructure, localhost services, local Chrome profile state, unpublished OmniRoute changes, or seat allocation inside Devin, say so plainly and hand back to the local supervisor.
- If you depend on another repository, name it explicitly in your handoff.
- If you open a PR, check Devin Review feedback before declaring the task complete.
- If auto-fix is enabled, address review findings before pausing for unrelated user input.

## Handoff contract

Before pausing, switching accounts, or ending a session, update `docs/handoffs/LATEST.md`.

Keep the handoff focused on outcomes, not transcript. Include:

- objective
- what was completed
- exact branch / PR / commit state
- tests or checks you ran
- important product or architectural decisions
- blockers and risks
- the single best next action for the next cloud agent

## Current operating context

- The team is building a multi-account Devin workflow where multiple cloud agents can continue one delivery contour through shared git state and disciplined handoffs.
- The dashboard selects accounts with available quota.
- Shared Devin-org repo access is currently blocked by seat allocation on the existing plan.
- The current practical access model is `machine user + per-account SSH keys`, but the target long-term contour is the GitHub App plan in `docs/github-app-control-plane-plan.md`.
- The current target stack is: OmniRoute as routing/data plane, Devin Dashboard as Devin-specific control plane, GitHub App broker as repo-access plane, and private GitHub plus handoffs as the durable continuity layer.
- The supervisor may later move to another agent, but for now local Codex is the authoritative coordinator.
- The immediate pilot repos are `lumamax/devin-dashboard` and local `OmniRoute` work that has not yet been fully published.
