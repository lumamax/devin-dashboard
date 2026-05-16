# Supervisor / Cloud Sync Contract

## Purpose

This file defines the canonical synchronization rules between:

- local Codex acting as supervisor
- remote Devin cloud sessions acting as execution workers

The contract is intentionally repo-agnostic.
It should be reused for any product repo that joins the Luma supervisor/cloud-agent contour, not only this dashboard.

## Shared source of truth

The durable source of truth is always:

1. remote git state on private GitHub
2. the current handoff file
3. explicit branch / PR / task ownership

It is never:

- hidden VM filesystem state
- browser tabs
- chat transcript alone
- assumptions about what another session already did

## Role split

### Local supervisor responsibilities

Local Codex owns:

- unpublished local work
- localhost-only services
- OmniRoute and dashboard runtime
- Chrome / cookie / session visibility
- repo routing decisions
- conflict resolution when two agents may overlap
- final decision on when work is ready to publish or hand off

The supervisor must:

1. decide which repo, branch, and task a cloud session receives
2. decide whether a task is safe to run in parallel
3. publish or explicitly withhold local-only changes
4. keep the handoff current when baton-passing between agents
5. pull remote state before resuming local work after a cloud agent changed the repo

### Cloud agent responsibilities

A Devin cloud session owns only the scoped work it was given.

The cloud agent must:

1. start from the latest remote state, not old VM state
2. read the current handoff before coding
3. stay inside its assigned branch and task
4. publish meaningful milestones to git
5. update the handoff before pause, quota exhaustion, or transfer
6. explicitly report blockers instead of silently working around missing local context

## Synchronization rhythm

Synchronization is event-driven, not timer-driven.
Do not sync every few minutes just to feel safe.
Sync on the events below.

### Required sync points for the supervisor

The local supervisor must sync at these moments:

1. before launching a new cloud session for a repo
2. after a cloud PR is merged to `main`
3. before resuming local work after remote activity
4. before handing the task to a different cloud account
5. before a long pause when unpublished local work matters

### Required sync points for a cloud agent

A cloud agent must sync at these moments:

1. immediately at session start
2. after a completed milestone
3. before opening or updating a PR
4. before pausing for more than a short interruption
5. before handing off due to quota, seat, permission, or environment blockers
6. after merge, if more follow-up work is still needed

### Quota-driven checkpoint policy

Quota must be interpreted by remaining headroom, not by raw used percentage.

If a surface only exposes used percentage, compute:

- remaining headroom = `100 - used`

For routing and safety decisions, use the tighter of the two remaining values:

- effective headroom = `min(daily headroom, weekly headroom)`

Default thresholds:

- above `20%`: healthy, normal work allowed
- `10%` to `20%`: draining, do not start a broad new task unless the supervisor explicitly chooses to
- at or below `10%`: checkpoint zone, the agent must prepare a clean milestone push soon
- at or below `5%`: forced handoff zone, the agent must push the current working branch, update the handoff, and avoid starting any new implementation slice
- at or below `2%`: stop-work zone, only finalize sync, push, and handoff if still possible

If either daily or weekly quota crosses a threshold, treat the session as having crossed it.

The supervisor should prefer rotating to a fresher account before a session reaches the forced handoff zone.


## Milestone rule

Do not push every tiny edit.
Push when a meaningful unit is complete.

A meaningful milestone usually means one of:

- a user-visible fix is complete
- one backend path is complete
- one reviewable refactor slice is complete
- tests for the scoped change are green
- the next agent could continue safely from this point

## Commit and PR policy

### Local Codex

- local checkpoint commits are allowed
- do not publish noisy checkpoint commits to `main`
- prefer squashed or compact history when merging finished work

### Cloud agents

- one session should usually produce one task branch
- one task branch should usually produce one PR
- prefer small reviewable PRs over large multi-purpose PRs
- if the session may die before completion, push the branch anyway and explain unfinished parts in the handoff

## Multi-session rule

Multiple Devin sessions may work on the same repository only if ownership is explicit.

### Allowed parallel pattern

Parallel work is allowed when each session has:

1. its own branch
2. its own scoped task
3. a disjoint write surface, or a clearly ordered dependency
4. a handoff target if another session must continue later

### Forbidden parallel pattern

Do not run two cloud sessions in parallel when they are both free to edit:

- the same file group
- the same PR branch
- the same migration or release step
- the same handoff file without coordination

If two sessions need the same area, serialize them.
One session finishes or hands off, then the next one starts.

### Write-zone ownership

For any repo with parallel Devin work, the supervisor must assign a concrete write zone to each session.

A write zone should be described by one or more of:

- file paths or glob groups
- modules or packages
- one PR branch
- one release or migration step

Default serialized zones that should have only one active owner at a time:

- `docs/handoffs/LATEST.md`
- release scripts and deploy steps
- schema or migration steps
- shared lockfiles when they are likely to conflict
- top-level operating docs such as `AGENTS.md` when multiple sessions are active

If a task touches a serialized zone, the supervisor must either:

1. reserve that zone to one session
2. or split the work so only one session edits that zone at the end


## Clone / workspace rule

Assume every new Devin session starts from a fresh clone.
That is normal and expected.

Because of that:

- every bootstrap prompt must point to the canonical repo and branch
- every session must verify repo access before work starts
- every handoff must contain exact git state
- no session may rely on leftover files from another VM

## Handoff contract

Every baton pass must update the handoff with:

- current objective
- what was completed
- exact branch / PR / commit state
- checks that were run
- blockers and risks
- the single next best action
- whether local supervisor action is required

The handoff must be short and operational.
Do not paste full transcripts.

## Merge back rule

After remote work lands on GitHub:

1. the supervisor fetches first
2. the supervisor checks whether local unpublished work overlaps
3. if there is overlap, the supervisor rebases or reapplies local changes consciously
4. only after that does local work continue

Do not keep coding locally for long on stale remote state after a cloud merge already happened.

### Required sync order when `origin/main` moved

If `origin/main` is ahead while local unpublished work exists, the order is:

1. save local state as a checkpoint commit, stash, or temp branch
2. fast-forward or rebase local `main` to `origin/main`
3. reapply the unpublished local work on top
4. resolve conflicts consciously
5. rerun the affected checks
6. only then continue new work

Never continue coding on top of stale local `main` just because the local edits feel small.

## Compactness rule

To avoid repo bloat:

- sync on milestones, not on every save
- keep handoffs concise
- squash noisy task history before `main` when practical
- delete merged task branches
- avoid duplicate docs that restate the same status in multiple places

### Branch cleanup ownership

Default owner for branch hygiene is the supervisor, not the next random receiving session.

The supervisor should periodically:

1. delete merged remote task branches
2. close abandoned local helper branches
3. keep `main` and the active task branches obvious

A cloud agent may clean up its own just-merged task branch if that is explicitly part of the task, but it should not delete another session's branch by default.

The handoff should always mark which branches are safe to delete.

## Escalation rule

If any session cannot determine the safe next step because of:

- overlapping ownership
- stale git state
- unpublished local-only code
- missing repo access
- seat allocation or quota blockers
- uncertainty about which repo is canonical

it must stop and hand back to the supervisor instead of guessing.

## Default operating cadence

Use this cadence unless the task clearly needs something else:

1. session start sync
2. scoped work
3. milestone push or PR update
4. handoff update if pausing or transferring
5. merge to `main` when the slice is complete
6. supervisor resync before the next slice begins
