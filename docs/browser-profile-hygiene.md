# Devin Browser Profile Hygiene

## Problem

The dashboard and surrounding automation can open Devin sessions through Chrome with a fresh temporary `--user-data-dir` each time. If the window or link is closed without cleanup, the profile directory stays behind in `/private/tmp` or the macOS per-user temp directory. Over time this creates large stale browser profiles and Chrome code-sign clones, including directories like:

- `/private/tmp/devin-chrome-userdata.*`
- `/private/tmp/chrome-githubapp-*`
- `/var/folders/.../T/devin-dashboard-login-*`
- `/var/folders/.../X/com.google.Chrome.code_sign_clone/code_sign_clone.*`

These directories are not the durable Devin dashboard store. They are browser runtime state, but they may contain short-lived session cookies while the matching browser is still alive.

## Required Direction

Do not let Devin browser automation create unbounded one-off Chrome profiles.

Use one of these approaches:

1. Stable profile per Devin account or session.
   - Derive a deterministic profile path from the account id and session id.
   - Reuse that profile while the session remains active.
   - Delete it when the session is explicitly closed, detached, or marked stale.

2. Profile janitor.
   - Track every created profile in a small registry under the dashboard home.
   - Record profile path, account id, session id, created time, last touched time, browser PID, and cleanup status.
   - Periodically remove profiles whose browser PID is gone and whose last touched time is older than the configured TTL.
   - Never remove a profile if `lsof` or a live Chrome process still references it.

The cleaner should also remove stale Chrome code-sign clone directories, but only when they are not referenced by a live Chrome process.

## Safety Rules

- Never delete the dashboard vault, account store, handoffs, repo state, or GitHub App credentials.
- Never delete a live browser profile while a Chrome process still uses it.
- Treat browser profiles as sensitive because they may contain cookies.
- Prefer deleting stale profiles over copying or archiving them.
- Keep cleanup logs scrubbed of cookies, tokens, headers, and full HAR data.

## Suggested Implementation Shape

- Add a small `scripts/profile-janitor.ts` or `scripts/profile-janitor.mjs`.
- Add a dashboard-owned registry file, for example `DEVIN_DASHBOARD_HOME/browser-profiles.json`.
- Run the janitor from launchd next to `com.luma.devin-dashboard`, or call it from the dashboard startup path before opening new automated Chrome sessions.
- Default TTL: 24 hours for detached profiles, shorter for failed login/check flows.
- Add a dry-run mode that prints reclaimable directories and bytes before removal.

## Current Manual Cleanup Finding

On 2026-05-17, stale Devin/Chrome temporary profiles and Chrome code-sign clones had grown large enough to consume significant local disk space. The immediate cleanup removed stale temp profiles and left only live runtime paths. This document exists so the cleanup becomes part of the product/ops model rather than a manual rescue task.
