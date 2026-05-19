/**
 * Per-account Chrome launcher.
 *
 * Each Devin account gets its own persistent --user-data-dir under
 * DEVIN_PROFILE_ROOT (default dashboard-home/profiles/<id>). Once the
 * user signs into app.devin.ai inside that window, the session cookie
 * survives subsequent re-opens. We never inject a cookie blindly — see
 * `extractCookies.ts` for the (carefully-scoped) auto-extract flow.
 *
 * The spawned Chrome is detached and unref'd so the dashboard's lifecycle
 * doesn't keep it alive.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { getDashboardHome } from "@/lib/dashboardStore";

export const DEVIN_WEB_URL = "https://app.devin.ai/";

export type LaunchOptions = {
  connectionId: string;
  /** Override the Chrome binary. Auto-detected per-OS by default. */
  binaryPath?: string;
  /** Override the profile root. Defaults to DEVIN_PROFILE_ROOT or dashboard-home/profiles. */
  profileRoot?: string;
  /** Override the full Chrome user-data-dir. */
  userDataDir?: string;
  /** Optional Chrome profile directory inside userDataDir (e.g. Default, Profile 1). */
  profileDirectory?: string;
  /** Override target URL. Defaults to https://app.devin.ai/. */
  url?: string;
  /** Optional Chrome remote debugging port for CDP automation. */
  remoteDebuggingPort?: number;
};

export type LaunchResult = {
  ok: true;
  binaryPath: string;
  profileDir: string;
  pid: number;
  url: string;
};

export class LauncherError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "LauncherError";
  }
}

const CHROME_CANDIDATES: Record<NodeJS.Platform, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/snap/bin/google-chrome",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
  aix: [],
  android: [],
  freebsd: [],
  haiku: [],
  openbsd: [],
  sunos: [],
  cygwin: [],
  netbsd: [],
};

const SAFE_ID = /^[A-Za-z0-9._-]+$/;

export function resolveChromeBinary(override?: string): string {
  const explicit = override || process.env.CHROME_BINARY_PATH;
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new LauncherError(
        "browser_not_found",
        `Configured Chrome binary does not exist: ${explicit}`,
      );
    }
    return explicit;
  }
  const platform = process.platform as NodeJS.Platform;
  const candidates = CHROME_CANDIDATES[platform] || [];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  if (platform === "win32") return "chrome.exe";
  return "google-chrome";
}

export function resolveProfileDir(connectionId: string, root?: string): string {
  if (!SAFE_ID.test(connectionId)) {
    throw new LauncherError(
      "invalid_connection_id",
      "Connection id contains characters that are unsafe for filesystem paths",
    );
  }
  const resolvedRoot =
    root ||
    process.env.DEVIN_PROFILE_ROOT ||
    path.join(getDashboardHome(), "profiles");
  const dir = path.join(resolvedRoot, connectionId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function buildLaunchArgs(
  userDataDir: string,
  url: string,
  profileDirectory?: string,
  remoteDebuggingPort?: number,
): string[] {
  const args = [
    `--user-data-dir=${userDataDir}`,
    "--no-default-browser-check",
    "--no-first-run",
    "--disable-features=TranslateUI",
    "--new-window",
  ];

  if (profileDirectory) {
    args.push(`--profile-directory=${profileDirectory}`);
  }

  if (typeof remoteDebuggingPort === "number") {
    args.push(`--remote-debugging-port=${remoteDebuggingPort}`);
  }

  args.push(url);
  return args;
}

function resolveUserDataDir(options: LaunchOptions): string {
  const explicit = options.userDataDir?.trim();
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new LauncherError(
        "profile_not_found",
        `Saved Chrome profile no longer exists: ${explicit}. Relink this Devin account to create a new durable login profile.`,
      );
    }
    return explicit;
  }

  return resolveProfileDir(options.connectionId, options.profileRoot);
}

export function launchChrome(options: LaunchOptions): LaunchResult {
  const url = options.url || DEVIN_WEB_URL;
  if (!/^https?:\/\//i.test(url)) {
    throw new LauncherError(
      "invalid_url",
      "Refusing to launch with a non-http(s) URL",
    );
  }
  const profileDir = resolveUserDataDir(options);
  const binaryPath = resolveChromeBinary(options.binaryPath);

  const child = spawn(
    binaryPath,
    buildLaunchArgs(
      profileDir,
      url,
      options.profileDirectory,
      options.remoteDebuggingPort,
    ),
    {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    },
  );
  child.unref();
  if (typeof child.pid !== "number") {
    throw new LauncherError(
      "spawn_failed",
      `Spawn returned no PID for ${binaryPath} — is Chrome installed?`,
    );
  }
  return {
    ok: true,
    binaryPath,
    profileDir,
    pid: child.pid,
    url,
  };
}
