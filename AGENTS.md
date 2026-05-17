# AGENTS.md

## Role Model

This repository is the pilot control plane for multi-account Devin cloud work.

- Local Codex is currently the supervisor. It coordinates local dashboard state, GitHub state, quota, and handoffs.
- Cloud Devin sessions are execution workers. They should treat GitHub plus the handoff files in this repo as the source of truth.
- Devin Dashboard is an account dispatcher and visibility layer. It is not the durable project state.

## Source Of Truth

- Durable state lives in private GitHub repositories.
- Session continuity is carried by git state, concise handoff notes, and explicit next actions.
- Do not assume a previous Devin VM still exists or that its filesystem is recoverable.
- Do not rely on raw chat transcript as the primary continuity mechanism.

## Model Preference

When the account allows model selection:

1. Prefer `Opus 4.7`
2. Else use `Max`
3. Else use `xhide`
4. Else use the strongest available coding model and state the fallback clearly in the handoff

## Before Starting Work

Read these files first:

1. `README.md`
2. `HANDOFF.md`
3. `docs/handoffs/LATEST.md`
4. `docs/cloud-agent-operating-model.md`
5. `docs/supervisor-cloud-sync-contract.md`
6. `docs/independent-control-plane-plan.md`
7. `docs/github-app-control-plane-plan.md`
8. `docs/pat-bootstrap.md`

If repo access is missing, stop immediately and report:

- which Devin account/org you are running under
- which GitHub installation or machine user is connected
- which repository is missing
- whether the blocker is repo permissions, repo setup, secrets, or environment setup

## Working Rules For Cloud Agents

- Work from the latest remote git state, not from assumptions about prior VM state.
- Read and follow `docs/supervisor-cloud-sync-contract.md` before doing repo work.
- Keep changes scoped to the active task.
- Prefer small PRs with explicit summaries over large silent rewrites.
- Assume one session equals one branch and one scoped unit of work unless the supervisor explicitly says otherwise.
- Use effective quota headroom = `min(daily remaining, weekly remaining)` when quota is visible.
- At `<=10%` quota, prepare a checkpoint push.
- At `<=5%` quota, push and hand off.
- At `<=2%` quota, stop new implementation work.
- Do not edit the same write surface in parallel with another cloud session unless ownership is explicit.
- If blocked by local-only infrastructure, localhost services, local browser profile state, or Devin seat allocation, say so plainly and hand back to the supervisor.
- If you depend on another repository, name it explicitly in your handoff.
- If you open a PR, check review feedback before declaring the task complete.

## Handoff Contract

Before pausing, switching accounts, or ending a session, update `docs/handoffs/LATEST.md`.

Keep the handoff focused on outcomes, not transcript. Include:

- objective
- what was completed
- exact branch, PR, and commit state
- tests or checks you ran
- important product or architectural decisions
- blockers and risks
- the single best next action for the next cloud agent

## Current Operating Context

- The team is building a multi-account Devin workflow where several cloud agents can continue one delivery contour through shared git state and disciplined handoffs.
- The dashboard selects accounts with available quota and prepares repositories through a local GitHub App broker.
- The dashboard now owns its local account vault and does not require OmniRoute at runtime.
- OmniRoute can be integrated later as a mature routing/provider layer, but it is not the core storage dependency for this repo.
- PAT access is a manual fallback only; never write a real PAT into code, docs, commits, or handoffs.
- The supervisor may later move to another agent, but local Codex is currently the authoritative coordinator.
