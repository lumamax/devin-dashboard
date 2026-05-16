# Latest Handoff

## Task

Continue `lumamax/devin-dashboard` as the active control-plane pilot for multi-account Devin work.

The current local objective is no longer just "store multiple Devin accounts".
The active objective is to turn those accounts into interchangeable cloud workers that can continue one shared git contour with handoffs, repo bootstrap, and quota-aware routing.

## Completed

- Pushed current dashboard work to `main` at commit `1a48b49`.
- Stabilized the local-only dashboard contour on `http://127.0.0.1:29128/`.
- Confirmed that Devin web credentials are stored as `devin-web` provider connections through OmniRoute.
- Confirmed live quota readout and model visibility per account.
- Confirmed quota semantics used by Devin in this contour:
  - `100%` means fully used
  - `0%` means headroom remains
- Added and validated per-account session control-plane endpoints:
  - `GET /api/accounts/[id]/sessions`
  - `GET /api/accounts/[id]/sessions/[sessionId]`
  - `GET /api/accounts/[id]/sessions/[sessionId]/events`
  - `GET /api/accounts/[id]/sessions/[sessionId]/prs`
- Fixed Devin payload parsing for real web responses:
  - session lists use `result`
  - status may arrive in `latest_status_contents`
  - event stream may arrive as one JSON payload instead of NDJSON
- Confirmed the UI can now show:
  - recent sessions
  - selected session summary
  - session status
  - PR references
  - event-derived summary blocks
- Added repo assignment / bootstrap pieces:
  - GitHub App broker panel
  - repo bootstrap prompt generation
  - per-account repo assignment state
  - connect-repo route
  - session seeding helpers
- Captured the architecture decision that this repo is the Devin-specific control plane, not a replacement for OmniRoute.

## Git state

- Repository: `lumamax/devin-dashboard`
- Branch: `main`
- Current commit: `1a48b49`
- Remote: `origin https://github.com/lumamax/devin-dashboard.git`
- Push state: `HEAD` is pushed and `origin/main` matches local `main`
- PR status: there is an older open `PR #1` referenced inside recovered Devin session history, but the current local work was pushed directly to `main`

## Validation

- `npm test` — passing (`23/23`)
- `npm run typecheck` — passing
- `npm run build` — passing
- Local dashboard server verified on `127.0.0.1:29128`
- Live API spot checks verified for:
  - account inventory
  - quota data
  - model labels
  - recent sessions
  - session details
  - PR data
  - event summaries

## Architecture decisions

- Do not treat this repo as a generic router.
- The current canonical stack is:
  1. `OmniRoute` = routing and quota-aware execution plane
  2. `Devin Dashboard` = Devin-specific control plane and operator UI
  3. `GitHub App broker` = short-lived repo access plane
  4. private GitHub under `lumamax` = durable source of truth
  5. handoff docs = continuity between cloud sessions
- Do not preserve continuity through hidden VM state.
- Preserve continuity through git state, repo bootstrap, and short factual handoffs.
- Shared Devin-org access is still blocked by seat allocation on the current plan.
- Current practical repo-access model remains:
  - near term: machine user + per-account SSH keys if needed
  - target: GitHub App installation tokens issued by the control plane

## Important context for the next agent

- The question "are we reinventing OmniRoute?" was resolved as follows:
  - OmniRoute already covers a large part of quota-aware routing and context relay.
  - This repo adds the missing Devin-specific orchestration layer: captured web sessions, Chrome-profile launch, account/session inspection, repo assignment, and GitHub bootstrap.
- Therefore the right direction is not to collapse everything into OmniRoute immediately.
- First stabilize the Devin control plane here.
- Later move mature routing primitives back into OmniRoute once the Devin workflow is proven.

## Key docs to read first

1. `README.md`
2. `AGENTS.md`
3. `docs/cloud-agent-operating-model.md`
4. `docs/devin-control-plane-target.md`
5. `docs/multi-account-git-access.md`
6. `docs/github-app-control-plane-plan.md`

## Next best action

Build the next operator-grade step in this repo:

- add a `pick-best-account` control-plane path that scores active Devin accounts by usable quota, lifecycle state, and repo readiness
- surface that in the dashboard so the supervisor can choose the next cloud worker without manually inspecting each card

After that, the next phase is session bootstrap into a new Devin worker from shared git + handoff, not from reused VM state.
