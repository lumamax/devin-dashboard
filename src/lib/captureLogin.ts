/**
 * "Add account via login" capture flow.
 *
 * Devin's web API is gated by `Authorization: Bearer <jwt>` + `x-cog-org-id`.
 * The bearer is derived from a `wos-session` cookie (WorkOS) on the first
 * call after page load. Capturing both is the only reliable way to make
 * subsequent programmatic API calls (limits, sessions, events).
 *
 * Flow:
 *   1. Dashboard backend spawns Chrome with --remote-debugging-port=<free>
 *      and a fresh, empty --user-data-dir (so the user actually has to log
 *      in), navigated to https://app.devin.ai.
 *   2. We connect to Chrome via CDP (chrome-remote-interface), enable the
 *      Network domain, and listen for `Network.requestWillBeSentExtraInfo`
 *      events. The first request to app.devin.ai/api/* with both an
 *      `authorization: Bearer ...` header and an `x-cog-org-id` is our
 *      capture — we read the cookie jar too, then close CDP.
 *   3. The captured triple (bearer, orgId, cookie) is held in-memory under
 *      a ticket id; the dashboard polls a status endpoint until it's there
 *      and then asks the user for a friendly name, finally saving the
 *      credentials into the local dashboard store.
 *
 * The Chrome window stays open after capture — the user can continue to
 * use it. We just stop listening.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import CDP from "chrome-remote-interface";
import {
  extractDevinCookieHeader,
  extractDevinProfileAuth,
} from "./extractCookies";
import { resolveChromeBinary, DEVIN_WEB_URL } from "./launcher";

export type CaptureStatus =
  | {
      status: "pending";
      ticket: string;
      chromePort: number;
      profileDir: string;
      startedAt: number;
    }
  | {
      status: "captured";
      ticket: string;
      capturedAt: number;
      bearer: string;
      orgId: string;
      cookie: string;
      cookieMap: Record<string, string>;
      suggestedName: string;
    }
  | { status: "error"; ticket: string; error: string; failedAt: number }
  | { status: "expired"; ticket: string };

const CAPTURE_TTL_MS = 10 * 60 * 1000; // 10 min — long enough for a slow manual login
const TICKETS = new Map<string, InternalState>();

type InternalState = {
  ticket: string;
  child: ChildProcess | null;
  cdpClient: CDP.Client | null;
  profileDir: string;
  chromePort: number;
  status: CaptureStatus;
  startedAt: number;
};

export async function startCapture(): Promise<{
  ticket: string;
  chromePort: number;
}> {
  pruneExpired();

  const ticket = `cap_${randomBytes(8).toString("hex")}`;
  const chromePort = await findFreePort();
  const profileDir = mkdtempSync(path.join(tmpdir(), "devin-dashboard-login-"));
  const binaryPath = resolveChromeBinary();
  const args = [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${chromePort}`,
    "--no-default-browser-check",
    "--no-first-run",
    "--disable-features=TranslateUI",
    DEVIN_WEB_URL,
  ];

  const child = spawn(binaryPath, args, {
    detached: false,
    stdio: "ignore",
    windowsHide: false,
  });

  if (typeof child.pid !== "number") {
    rmSync(profileDir, { recursive: true, force: true });
    throw new Error(
      `Failed to spawn Chrome for login capture (binary=${binaryPath})`,
    );
  }

  const state: InternalState = {
    ticket,
    child,
    cdpClient: null,
    profileDir,
    chromePort,
    status: {
      status: "pending",
      ticket,
      chromePort,
      profileDir,
      startedAt: Date.now(),
    },
    startedAt: Date.now(),
  };
  TICKETS.set(ticket, state);

  // Kick off CDP attach in the background. We retry a few times because
  // Chrome takes ~500ms-2s to expose its debug server after spawn.
  attachCdp(state).catch((err) => {
    if (state.status.status === "pending") {
      state.status = {
        status: "error",
        ticket,
        error: err instanceof Error ? err.message : String(err),
        failedAt: Date.now(),
      };
    }
  });
  watchProfileForSession(state).catch(() => {
    // Network capture remains the primary path. The profile watcher is a
    // best-effort fallback for auth flows where the useful headers never
    // arrive together on the same request.
  });

  return { ticket, chromePort };
}

export function getCaptureStatus(ticket: string): CaptureStatus {
  const state = TICKETS.get(ticket);
  if (!state) return { status: "expired", ticket };
  if (
    Date.now() - state.startedAt > CAPTURE_TTL_MS &&
    state.status.status === "pending"
  ) {
    cleanup(state);
    state.status = { status: "expired", ticket };
  }
  return state.status;
}

/**
 * Forget the capture ticket. Closes CDP (Chrome stays open for the user)
 * and deletes the temp profile dir. Idempotent.
 */
export function disposeCapture(ticket: string): void {
  const state = TICKETS.get(ticket);
  if (!state) return;
  cleanup(state);
  TICKETS.delete(ticket);
}

function cleanup(state: InternalState): void {
  try {
    state.cdpClient?.close();
  } catch {
    /* ignore */
  }
  state.cdpClient = null;
  // We do NOT kill the Chrome child — the user is still using the window.
  // Temp profile is intentionally NOT deleted either: the user is logged in
  // there, and the next time they open Devin from this dashboard we want
  // that session to persist. The dashboard will move/rename this profile
  // when the connection is saved (see saveCapturedAccount in routes).
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [ticket, state] of TICKETS) {
    if (now - state.startedAt > CAPTURE_TTL_MS) {
      cleanup(state);
      TICKETS.delete(ticket);
    }
  }
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close();
        reject(new Error("Failed to allocate free port"));
      }
    });
  });
}

async function attachCdp(state: InternalState): Promise<void> {
  // Wait for Chrome's debug server to become reachable.
  const deadline = Date.now() + 30_000;
  let lastError: Error | null = null;
  let client: CDP.Client | null = null;
  while (Date.now() < deadline) {
    try {
      const targets = await CDP.List({ port: state.chromePort });
      const page = targets.find(
        (t) => t.type === "page" && t.url.includes("devin.ai"),
      );
      const target = page || targets.find((t) => t.type === "page");
      if (target) {
        client = await CDP({ target: target.webSocketDebuggerUrl });
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    await sleep(500);
  }
  if (!client) {
    throw new Error(
      `Could not connect to Chrome debug port ${state.chromePort}: ${lastError?.message || "no target"}`,
    );
  }
  state.cdpClient = client;

  const { Network } = client;
  await Network.enable({});
  const requestUrlById = new Map<string, string>();

  // Headers can arrive on either `requestWillBeSent` (basic) or
  // `requestWillBeSentExtraInfo` (post-CORS/cookie). The Bearer is usually
  // present on the extra-info event. We listen to both and use whichever
  // fires first with a valid auth header.
  const handler = (eventHeaders: Record<string, string>, url: string) => {
    if (state.status.status !== "pending") return;
    if (!url.startsWith("https://app.devin.ai/api/")) return;

    const lowered = lowerCaseKeys(eventHeaders);
    const auth = lowered["authorization"];
    const orgId = lowered["x-cog-org-id"];
    if (!auth || !auth.toLowerCase().startsWith("bearer ")) return;

    captureFromObservedAuth(state, client, auth, orgId, url).catch((err) => {
      if (state.status.status !== "pending") return;
      state.status = {
        status: "error",
        ticket: state.ticket,
        error: err instanceof Error ? err.message : String(err),
        failedAt: Date.now(),
      };
      cleanup(state);
    });
  };

  Network.requestWillBeSent((params) => {
    requestUrlById.set(String(params.requestId), params.request.url);
    handler(
      params.request.headers as Record<string, string>,
      params.request.url,
    );
  });
  Network.requestWillBeSentExtraInfo((params) => {
    const url =
      requestUrlById.get(String(params.requestId)) ||
      (params as unknown as { documentURL?: string }).documentURL ||
      "";
    handler(params.headers as Record<string, string>, url);
  });
}

async function captureFromObservedAuth(
  state: InternalState,
  client: CDP.Client,
  authorization: string,
  orgIdFromHeader: string | undefined,
  apiUrl: string,
): Promise<void> {
  if (state.status.status !== "pending") return;

  const profilePath = path.join(state.profileDir, "Default");
  const profileAuth = tryExtractProfileAuth(profilePath);
  const cookieJar = await captureCookies(client, apiUrl).catch(() => null);

  const bearer =
    profileAuth?.bearer || authorization.slice("bearer ".length).trim();
  const orgId = profileAuth?.orgId || orgIdFromHeader || null;
  const suggestedName = await buildSuggestedName(
    orgId,
    profileAuth?.userId || null,
    bearer,
  );

  if (!orgId) return;

  applyCapturedState(state, {
    bearer,
    orgId,
    cookie: cookieJar ? serializeCookieHeader(cookieJar) : "",
    cookieMap: cookieJar || {},
    suggestedName,
  });
}

async function watchProfileForSession(state: InternalState): Promise<void> {
  const profilePath = path.join(state.profileDir, "Default");
  const deadline = state.startedAt + CAPTURE_TTL_MS;

  while (Date.now() < deadline) {
    if (state.status.status !== "pending") return;

    try {
      const [cookie, auth] = await Promise.all([
        extractDevinCookieHeader({ sourceProfile: profilePath }),
        Promise.resolve(extractDevinProfileAuth(profilePath)),
      ]);
      const suggestedName = await buildSuggestedName(
        auth.orgId,
        auth.userId,
        auth.bearer,
      );
      applyCapturedState(state, {
        bearer: auth.bearer,
        orgId: auth.orgId,
        cookie: cookie.cookieHeader,
        cookieMap: Object.fromEntries(
          cookie.cookies.map((entry) => [entry.name, entry.value]),
        ),
        suggestedName,
      });
      return;
    } catch {
      // Keep polling until the login flow finishes and Chrome flushes the
      // profile to disk.
    }

    await sleep(1000);
  }
}

function tryExtractProfileAuth(
  profilePath: string,
): ReturnType<typeof extractDevinProfileAuth> | null {
  try {
    return extractDevinProfileAuth(profilePath);
  } catch {
    return null;
  }
}

async function buildSuggestedName(
  orgId: string | null,
  userId: string | null,
  bearer: string,
): Promise<string> {
  const orgName = await fetchOrgNameFromBearer(bearer).catch(() => null);
  const base = orgName || orgId || "Devin account";
  return userId ? `${base} · ${userId.slice(-6)}` : base;
}

async function fetchOrgNameFromBearer(bearer: string): Promise<string | null> {
  const res = await fetch("https://app.devin.ai/api/users/post-auth", {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      Referer: `${DEVIN_WEB_URL}`,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({}),
    cache: "no-store",
  });

  if (!res.ok) return null;

  const json = (await res.json().catch(() => null)) as {
    org_name?: unknown;
  } | null;
  return typeof json?.org_name === "string" && json.org_name.trim().length > 0
    ? json.org_name.trim()
    : null;
}

function applyCapturedState(
  state: InternalState,
  input: {
    bearer: string;
    orgId: string;
    cookie: string;
    cookieMap: Record<string, string>;
    suggestedName: string;
  },
): void {
  if (state.status.status !== "pending") return;
  state.status = {
    status: "captured",
    ticket: state.ticket,
    capturedAt: Date.now(),
    bearer: input.bearer,
    orgId: input.orgId,
    cookie: input.cookie,
    cookieMap: input.cookieMap,
    suggestedName: input.suggestedName,
  };
  cleanup(state);
}

async function captureCookies(
  client: CDP.Client,
  apiUrl: string,
): Promise<Record<string, string>> {
  // Pull every cookie that would be sent on a request to `apiUrl`.
  // Network.getCookies returns the full jar including HttpOnly.
  const { Network } = client;
  const { cookies } = await Network.getCookies({
    urls: [apiUrl, DEVIN_WEB_URL],
  });
  const jar: Record<string, string> = {};
  for (const c of cookies) {
    jar[c.name] = c.value;
  }
  return jar;
}

function lowerCaseKeys(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers || {})) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function serializeCookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Returns the temp profile dir that was used during capture, so it can be
 * promoted into a permanent per-account profile dir (renamed or symlinked
 * under DEVIN_PROFILE_ROOT/<connectionId>) by the save handler. Returns
 * null when the ticket is gone or never captured.
 *
 * v0.2 leaves the temp dir in place and stores its path inside the
 * connection's providerSpecificData (TODO). For now it's a utility hook.
 */
export function getCaptureProfileDir(ticket: string): string | null {
  const state = TICKETS.get(ticket);
  if (!state) return null;
  if (state.status.status !== "captured") return null;
  if (!existsSync(state.profileDir)) return null;
  return state.profileDir;
}
