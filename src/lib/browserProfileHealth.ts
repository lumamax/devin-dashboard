import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { DevinLaunchContext, StoredDevinAccount } from "@/lib/connectionStore";

export type BrowserProfileState = "ready" | "recoverable" | "relink-required" | "unknown";

export type BrowserProfileHealth = {
  state: BrowserProfileState;
  code: string;
  message: string;
  userDataDir: string | null;
  profileDirectory: string | null;
  pathExists: boolean | null;
  hasStoredCookie: boolean;
  hasProfileCookie: boolean;
};

const MAX_COOKIE_DB_BYTES = 32 * 1024 * 1024;
const DEVIN_COOKIE_MARKERS = [
  "webapp_logged_in",
  "did_compat",
  "attachments_token",
];

export function assessBrowserProfile(account: StoredDevinAccount): BrowserProfileHealth {
  const userDataDir = getLaunchUserDataDir(account.launchContext);
  const profileDirectory = account.launchContext?.chromeProfileDirectory || null;
  const hasStoredCookie = Boolean(account.creds?.cookie?.trim());
  const pathExists = userDataDir ? existsSync(userDataDir) : null;
  const hasProfileCookie = Boolean(
    userDataDir && pathExists && profileHasDevinCookie(userDataDir, profileDirectory || undefined),
  );

  if (!account.launchContext || !userDataDir) {
    return {
      state: hasStoredCookie ? "recoverable" : "unknown",
      code: hasStoredCookie ? "profile_not_recorded_cookie_available" : "profile_not_recorded",
      message: hasStoredCookie
        ? "Browser profile path is not recorded, but the stored cookie can seed a fresh profile."
        : "Browser profile path is not recorded for this account.",
      userDataDir: null,
      profileDirectory: null,
      pathExists,
      hasStoredCookie,
      hasProfileCookie,
    };
  }

  if (!pathExists) {
    if (hasStoredCookie) {
      return {
        state: "recoverable",
        code: "profile_missing_cookie_available",
        message: "Saved browser profile is missing, but the stored Devin cookie can seed a durable profile.",
        userDataDir,
        profileDirectory,
        pathExists,
        hasStoredCookie,
        hasProfileCookie,
      };
    }

    return {
      state: "relink-required",
      code: "profile_missing_no_cookie",
      message: "Saved browser profile is missing and this account has no stored Devin cookie. Relink is required.",
      userDataDir,
      profileDirectory,
      pathExists,
      hasStoredCookie,
      hasProfileCookie,
    };
  }

  if (hasProfileCookie) {
    return {
      state: "ready",
      code: "profile_cookie_present",
      message: "Browser profile exists and contains Devin login cookies.",
      userDataDir,
      profileDirectory,
      pathExists,
      hasStoredCookie,
      hasProfileCookie,
    };
  }

  if (hasStoredCookie) {
    return {
      state: "recoverable",
      code: "profile_exists_cookie_available",
      message: "Browser profile exists, but Devin cookies were not found on disk; stored cookie recovery is available.",
      userDataDir,
      profileDirectory,
      pathExists,
      hasStoredCookie,
      hasProfileCookie,
    };
  }

  return {
    state: "relink-required",
    code: "profile_exists_no_cookie",
    message: "Browser profile exists, but no Devin login cookie is stored or visible in the profile. Relink is required.",
    userDataDir,
    profileDirectory,
    pathExists,
    hasStoredCookie,
    hasProfileCookie,
  };
}

export function getLaunchUserDataDir(launchContext: DevinLaunchContext | null): string | null {
  if (!launchContext) return null;
  if (launchContext.launchStrategy === "user-data-dir") {
    return launchContext.userDataDir || null;
  }
  return launchContext.chromeUserDataDir || null;
}

export function profileHasDevinCookie(userDataDir: string, profileDirectory?: string): boolean {
  for (const cookieFile of findCookieFiles(userDataDir, profileDirectory)) {
    try {
      const stat = statSync(cookieFile);
      if (!stat.isFile() || stat.size > MAX_COOKIE_DB_BYTES) continue;
      const data = readFileSync(cookieFile);
      if (DEVIN_COOKIE_MARKERS.some((marker) => data.includes(Buffer.from(marker)))) {
        return true;
      }
    } catch {
      // Chrome can hold the cookie DB open. A failed read should not crash the dashboard.
    }
  }
  return false;
}

function findCookieFiles(userDataDir: string, profileDirectory?: string): string[] {
  const profileRoots = profileDirectory
    ? [path.join(userDataDir, profileDirectory)]
    : listLikelyProfileRoots(userDataDir);

  const files: string[] = [];
  for (const root of profileRoots) {
    files.push(path.join(root, "Network", "Cookies"));
    files.push(path.join(root, "Cookies"));
  }
  return [...new Set(files)].filter((file) => existsSync(file));
}

function listLikelyProfileRoots(userDataDir: string): string[] {
  const roots = [path.join(userDataDir, "Default"), userDataDir];
  try {
    for (const entry of readdirSync(userDataDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "Default" || entry.name.startsWith("Profile ")) {
        roots.push(path.join(userDataDir, entry.name));
      }
    }
  } catch {
    // Missing or unreadable profile roots are handled by the caller.
  }
  return [...new Set(roots)];
}
