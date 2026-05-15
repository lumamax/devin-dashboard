# Multi-account routing across Devin accounts — feasibility

_Last updated: v0.2._

This doc is the answer to:

> Can we route a single user-facing Devin "chat" across multiple Devin accounts
> automatically — the way Codex Pro / Claude Code Pro multiplex requests
> across your subscription pool — and keep one shared conversation context?

**Short answer:** Not the same way you can do it for Codex/Claude. Devin is
not a synchronous LLM-completion product. Below is what _is_ doable, what
isn't, and the closest approximations.

## Why Codex/Claude-style routing is straightforward there but not here

- **Codex / Claude / ChatGPT** are stateless from the network's perspective:
  every chat turn is a full `messages[]` array sent to the model. The
  "context" is just the message history the client sends each turn. Switching
  providers between turns is trivial — just point the next request at a
  different account's API key.

- **Devin** is **stateful at the VM level**: each session (`devin-<uuid>`) is
  bound to a long-running cloud VM with a cloned repo, installed deps, open
  files, a Chrome browser, etc. The "context" is _that VM's filesystem and
  process state_, not a message history. You can't take that state and "swipe
  it" to another account's VM.

This means you can't run a continuous Devin session on account A and then,
when A's quota is exhausted, transparently continue the _same_ session on B.
B has no VM, no repo, no shell history — it would have to start fresh.

## Three feasible patterns

### A. Task-level rotation _(simple, lossy on context)_

For each **new** task the user issues, pick the account with the most quota
left and create a brand-new session on it.

- **What carries over**: nothing — each task is independent.
- **What breaks**: long multi-day workflows where you keep iterating on the
  same PR, branch, or VM state. You'd be starting from scratch on the new
  account each time.
- **What we'd build**: a router endpoint
  `POST /api/route/new-task { prompt, repo?, branch? }` that:
  1. Reads quota for every stored devin-web account.
  2. Picks the one with the highest `(max_acu_limit − acu_used_since_last_reset)`.
  3. Creates a session on that account via `POST /api/sessions` (or whatever
     Devin's create-session endpoint turns out to be — we don't have it in
     the current HAR).
  4. Returns the new `devin-<uuid>` to the caller.

Good for: bursty automation, one-off tasks. Bad for: a single human's
continuous workflow.

### B. Context handoff lite _(text-only, files lost)_

When account A's quota runs low, package its session's chat history as a
single prompt and create a new session on account B with that prompt as the
initial instruction.

- **What carries over**: the conversation transcript (`user_message`,
  `devin_message`, `devin_thoughts`), the goal, and any code snippets the
  user pasted inline.
- **What breaks**: the VM's actual repo state. Files Devin edited but didn't
  push, terminal scrollback, mid-flight test runs, the Chrome browser state.
  Effectively you start the work from the last clean commit.
- **What we'd build**:
  1. Fetch `/api/events/<devin-id>/stream?order=desc` for the source session.
  2. Filter for `user_message` / `devin_message` / `devin_thoughts` event types.
  3. Render as Markdown: `# Goal\n…\n# Prior conversation\n…\n# Continue from here\n…`.
  4. Open a new session on the target account with that as the first prompt.
  5. Optionally re-attach the same repo + branch so the new VM picks up
     from the last pushed state.

Good for: planned handoffs at natural break points (after a PR is opened).
Bad for: mid-debug, mid-test scenarios where the VM has uncommitted state.

### C. Side-by-side multi-session view _(no routing, just visibility)_

The dashboard shows N sessions across N accounts simultaneously. The user
manually decides which session to talk to. Routing logic stays in the user's
head; the dashboard just makes quota and session state visible so they can
choose.

- **What carries over**: nothing automatically. The user is the router.
- **What we'd build**: a side panel with one tab per account, each showing
  its recent sessions and live event stream. Click "send to this session"
  to type into one. This is essentially the "v0.3 read-only chat" plan, plus
  send-message support.

Good for: power users who want full visibility. Bad for: automation /
"set and forget".

## What is _not_ possible without upstream Devin changes

- **Same VM, different account quota**: there is no API in Devin's web app
  that lets one account's session draw on another account's quota. The
  `max_acu_limit` is per-session, set at session creation, and tied to the
  creating account.

- **VM state migration**: Devin doesn't expose snapshot/restore. The VM is
  not user-controllable that way.

- **Cross-account session ownership transfer**: there's no
  `POST /api/sessions/<id>/transfer-to/<account>`. Sessions are tightly bound
  to the creator's account/org.

If Devin ever exposes a session-export / session-import API, **B** becomes
much stronger (you could include repo state, not just chat).

## What we _will_ build, in order

1. **v0.2 (this release)**: Quota readout per account. The data layer needed
   for any router to make a sensible choice.
2. **v0.3**: Read-only chat view of any captured account's sessions, via the
   event-stream NDJSON. This is what unlocks pattern **B** technically.
3. **v0.4 (optional)**: Pattern A: a small router that picks the freshest
   account for `new-task` calls. Requires we figure out Devin's create-session
   endpoint — current HAR doesn't include it.
4. **v0.5 (research)**: Pattern B: prompt-as-context handoff. Requires v0.3
   data + a stable session-create endpoint.

Pattern **C** (multi-session view) drops out of v0.3 for free since once you
can read events from one session, rendering N of them side-by-side is
straightforward.

## Acknowledged tradeoffs

The user explicitly asked for Codex-Pro-like single-session-across-accounts
routing. The honest answer is that Devin's product surface does not support
it today and we cannot fake it without significant context loss. The
**dashboard's value proposition** therefore shifts from "transparent
multiplexing" to:

- **One-click sign-in** per account (v0.2 ✓)
- **Live quota visibility** so you know when to switch (v0.2 ✓)
- **Live session visibility** so you know what's happening on each account (v0.3)
- **Handoff helper** that packages a session as a continuation prompt (v0.5)
- **Smart picker** for brand-new tasks (v0.4)

That's the practical max for the current Devin product. If/when Devin ships
account-level multiplexing or session-state export APIs, we revisit.
