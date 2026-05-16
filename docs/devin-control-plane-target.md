# Devin Control Plane Target

## Purpose

This repository is the current control-plane pilot for multi-account Devin execution.

The goal is not just to rotate between accounts with spare quota.
The goal is to make multiple Devin cloud sessions behave like interchangeable workers that can continue one shared delivery contour through:

- private GitHub under `lumamax`
- short-lived repo access grants
- disciplined handoffs
- supervisor-controlled account selection
- eventual routing integration with OmniRoute

## Core decision

Do not treat OmniRoute and Devin Dashboard as the same product surface.

They serve different roles.

### OmniRoute

OmniRoute is the routing and execution data plane.

It already provides the right primitives for:

- quota-aware account selection
- multi-account balancing
- fallback policies
- context-relay style handoffs
- OpenAI-compatible request routing

### Devin Dashboard

Devin Dashboard is the Devin-specific control plane and operator surface.

It owns:

- Devin web session capture
- per-account Chrome profile isolation
- live Devin quota and model visibility
- recent Devin session visibility
- repo assignment state for each account
- operator-driven bootstrap into the shared git contour

### GitHub App broker

The GitHub App broker is the auth plane for shared repo access.

It should mint short-lived installation tokens for the exact repo scope needed by the active cloud agent.

### Private GitHub

Private GitHub under `lumamax` is the durable source of truth.

Continuity must live in:

1. commits
2. branches
3. PRs
4. handoffs

It must not depend on one surviving Devin VM.

## Current local pilot shape

As of the current `main` branch:

- Devin accounts are stored as `devin-web` provider connections through OmniRoute
- the dashboard can capture and refresh Devin web credentials
- the dashboard can read live quota and available model labels from Devin web APIs
- the dashboard can open isolated account profiles in Chrome
- the dashboard can show recent Devin sessions, session details, PRs, and event summaries
- the dashboard includes a local GitHub App bootstrap broker and repo bootstrap panel
- the dashboard can store per-account repo assignment and seed repo-specific bootstrap prompts

## What this means

We are not building a second generic router.

We are building the missing Devin-specific orchestration layer that sits above routing.

If the only goal were request-level balancing across accounts, the work should move directly into OmniRoute.

But the current goal is broader:

- choose the right Devin account
- open or inspect the right Devin session
- grant the right repo access
- inject the right bootstrap context
- preserve continuity when one cloud session runs out of quota

That is control-plane work, not just routing.

## Target end state

The intended long-term stack is:

1. `OmniRoute` = request routing and quota-aware execution plane
2. `Devin Dashboard` = account/session control plane and operator UI
3. `GitHub App broker` = short-lived repo access issuance
4. `lumamax/*` private GitHub repos = durable project state
5. `handoffs` = session-to-session continuity layer

## Near-term roadmap

### Phase 1

Stabilize the current local dashboard contour.

- account capture
- quota visibility
- session visibility
- repo bootstrap visibility

### Phase 2

Add first-class assignment logic.

- pick-best-account endpoint
- draining / active / exhausted lifecycle states
- stronger operator guidance on which account should take the next task

### Phase 3

Add controlled task handoff into a new Devin session.

- generate bootstrap prompt from current repo state and latest handoff
- attach repo assignment cleanly
- resume work in a new Devin account when quota rotates

### Phase 4

Integrate the mature routing parts back into OmniRoute.

- account picking policy
- quota-based scoring
- context relay thresholds
- provider-level Devin routing when the API contour is proven

## Anti-goals

Do not optimize for these:

- preserving one Devin VM forever
- sharing one long-lived PAT across all agents
- using copied browser sessions as the durable repo access model
- moving all control-plane logic into OmniRoute before the Devin workflow is stable

## Canonical summary

The dashboard is not a replacement for OmniRoute.

It is the Devin-specific control plane that makes OmniRoute-style routing useful for real multi-account cloud-agent work.
