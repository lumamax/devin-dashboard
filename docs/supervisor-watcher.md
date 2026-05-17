# Supervisor Watcher

## Purpose

The dashboard can now run a lightweight local supervisor loop outside any Codex thread.

This watcher is meant to be the low-resource quota sentinel for multi-account Devin work:

- poll account quota headroom every few minutes
- detect threshold crossings only
- suggest the best successor account for the same repo
- nudge a live Devin session into checkpoint / handoff mode when a dashboard-managed Chrome debug port is available
- otherwise leave a durable local alert trail without pretending it fully automated the handoff

## Thresholds

The watcher uses remaining headroom, not used percentage.

- `healthy` above `20%`
- `draining` at `20%` or below
- `checkpoint` at `10%` or below
- `force` at `5%` or below
- `stop` at `2%` or below
- `exhausted` at `0%`

Effective headroom is always:

- `min(daily remaining, weekly remaining)`

## What it writes

By default the watcher keeps its own tiny local state under the dashboard home (`~/.devin-dashboard` on macOS/Linux, `%APPDATA%\\devin-dashboard` on Windows):

- `supervisor-state.json` — last known zone and action memory per account
- `supervisor-latest.json` — latest full snapshot for operator inspection
- `supervisor-events.ndjson` — append-only event log for real transitions and action attempts

This makes the contour independent from the current chat thread.

## Commands

Run one tick:

```bash
npm run supervisor:once
```

Run one tick without sending live nudges into Devin:

```bash
npm run supervisor:once -- --dry-run
```

Run the watcher loop:

```bash
npm run supervisor:watch
```

Change the polling interval in seconds:

```bash
npm run supervisor:watch -- --interval 120
```

## Live intervention path

When a watched account is in a dashboard-managed Chrome profile and that Chrome process has a local debug port, the watcher can send a short checkpoint or handoff prompt directly into the matching Devin session via CDP.

This is intentionally local-only and best-effort.

If there is no matching debug port, the watcher does not fake success. It logs an alert-only action and still records the recommended successor account.

## Current limitation

We have a proven backend path for:

- creating new Devin sessions through `POST /api/sessions`

We do not yet have a confirmed pure-backend endpoint for:

- appending a new user instruction into an already running Devin session

So the autonomous “finish now and hand off” behavior currently uses CDP when possible, not a confirmed HTTP write API.

## Operational advice

For accounts that should be fully supervisor-manageable, launch them through the dashboard so the profile stays visible to the local watcher.

That gives the supervisor the best chance to:

- see the right session tab
- send the checkpoint prompt at the right time
- recommend the next account before the current one burns through the last quota band
