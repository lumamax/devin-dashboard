/**
 * Extract `wos-session` from the user's day-to-day Chrome profile.
 *
 * Chrome stores cookies in a SQLite file under each profile directory. The
 * `value` column is empty for "encrypted" cookies — the real bytes live in
 * `encrypted_value`, prefixed by a 3-byte version tag (`v10`, `v11`, …).
 * Decryption is OS-specific because Chrome wraps the AES key with the OS
 * secret store:
 *
 *   - macOS:   key is in the Keychain under "Chrome Safe Storage"
 *   - Linux:   key is in libsecret (Gnome Keyring / KWallet) under the
 *              attribute `application=chrome` / `application=chromium`,
 *              or the well-known fallback password `peanuts` when no
 *              secret store is available
 *   - Windows: key is wrapped with DPAPI and stored in
 *              `Local State` JSON; full decryption requires DPAPI access
 *              (PowerShell or a native node module) — handled by a
 *              short PowerShell helper.
 *
 * v1 of this module implements macOS fully; Linux supports the peanuts
 * fallback and libsecret-tool, and Windows shells out to PowerShell when
 * available. On any platform/cookie that we cannot decrypt we surface a
 * structured error so the UI can offer manual paste as a fallback.
 */

import { execFile, execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExtractedCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiresUtcSeconds: number | null;
  isHttpOnly: boolean;
  isSecure: boolean;
};

export class CookieExtractError extends Error {
  code: string;
  hint?: string;
  constructor(code: string, message: string, hint?: string) {
    super(message);
    this.code = code;
    this.hint = hint;
    this.name = "CookieExtractError";
  }
}

const DEVIN_COOKIE_HOSTS = new Set([
  ".devin.ai",
  "app.devin.ai",
  "auth.devin.ai",
  "devin.ai",
]);
const COOKIE_NAME = "wos-session";

export type ExtractOptions = {
  /** Override the source Chrome profile directory. */
  sourceProfile?: string;
  /** Cookie name to extract (defaults to wos-session). */
  cookieName?: string;
};

export type ExtractResult = {
  cookieName: string;
  cookieValue: string;
  source: "chrome-default" | string;
  platform: NodeJS.Platform;
  encryption:
    | "macos-keychain"
    | "linux-peanuts"
    | "linux-libsecret"
    | "windows-dpapi"
    | "none";
};

export type ExtractedCookieHeaderResult = {
  cookieHeader: string;
  cookies: ExtractedCookie[];
  source: "chrome-default" | string;
  platform: NodeJS.Platform;
  encryption: ExtractResult["encryption"];
};

export type ChromeProfileDescriptor = {
  profileDirName: string;
  profilePath: string;
  userDataRoot: string;
  displayName: string;
  userName: string | null;
};

export type ExtractedDevinProfileAuth = {
  bearer: string;
  orgId: string;
  rawToken: string;
  userId: string | null;
};

export async function extractWosSession(
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  const cookieName = options.cookieName || COOKIE_NAME;
  const sourceProfile = resolveSourceProfile(options.sourceProfile);
  const cookiesFile = findCookiesFile(sourceProfile);
  if (!existsSync(cookiesFile)) {
    throw new CookieExtractError(
      "cookies_db_not_found",
      `Chrome cookies file not found at ${cookiesFile}`,
      "Open Chrome at least once and sign into app.devin.ai, then try again.",
    );
  }

  const rows = readCookieRows(cookiesFile, cookieName);
  if (rows.length === 0) {
    throw new CookieExtractError(
      "cookie_not_found",
      `No ${cookieName} cookie found for app.devin.ai in ${cookiesFile}`,
      "Sign into app.devin.ai in this Chrome profile, refresh once, then retry.",
    );
  }

  const row = rows[0];
  const platform = process.platform as NodeJS.Platform;

  if (row.encrypted_value && row.encrypted_value.length > 0) {
    const { plaintext, encryption } = await decryptValue(
      row.encrypted_value,
      platform,
      row.host_key,
    );
    return {
      cookieName: row.name,
      cookieValue: plaintext,
      source:
        sourceProfile === resolveSourceProfile(undefined)
          ? "chrome-default"
          : sourceProfile,
      platform,
      encryption,
    };
  }

  if (row.value) {
    return {
      cookieName: row.name,
      cookieValue: row.value,
      source:
        sourceProfile === resolveSourceProfile(undefined)
          ? "chrome-default"
          : sourceProfile,
      platform,
      encryption: "none",
    };
  }

  throw new CookieExtractError(
    "cookie_empty",
    "Cookie row found but both `value` and `encrypted_value` are empty",
    "Sign into app.devin.ai once more in Chrome and try again.",
  );
}

export async function extractDevinCookieHeader(
  options: Omit<ExtractOptions, "cookieName"> = {},
): Promise<ExtractedCookieHeaderResult> {
  const sourceProfile = resolveSourceProfile(options.sourceProfile);
  const cookiesFile = findCookiesFile(sourceProfile);
  if (!existsSync(cookiesFile)) {
    throw new CookieExtractError(
      "cookies_db_not_found",
      `Chrome cookies file not found at ${cookiesFile}`,
      "Open Chrome at least once and sign into app.devin.ai, then try again.",
    );
  }

  const rows = readCookieRows(cookiesFile);
  if (rows.length === 0) {
    throw new CookieExtractError(
      "cookie_not_found",
      `No Devin cookies found in ${cookiesFile}`,
      "Sign into app.devin.ai in this Chrome profile, refresh once, then retry.",
    );
  }

  const platform = process.platform as NodeJS.Platform;
  const cookies: ExtractedCookie[] = [];
  let encryption: ExtractResult["encryption"] = "none";

  for (const row of rows) {
    let value = row.value;
    if ((!value || value.length === 0) && row.encrypted_value.length > 0) {
      const decrypted = await decryptValue(
        row.encrypted_value,
        platform,
        row.host_key,
      );
      value = decrypted.plaintext;
      if (encryption === "none") {
        encryption = decrypted.encryption;
      }
    }

    if (!value) continue;

    cookies.push({
      name: row.name,
      value,
      domain: row.host_key,
      path: row.path,
      expiresUtcSeconds: row.expires_utc,
      isHttpOnly: row.is_httponly === 1,
      isSecure: row.is_secure === 1,
    });
  }

  if (cookies.length === 0) {
    throw new CookieExtractError(
      "cookie_empty",
      "Devin cookies were found, but none of them had a usable value",
      "Refresh app.devin.ai in Chrome once more and retry.",
    );
  }

  return {
    cookieHeader: serializeCookieHeader(
      Object.fromEntries(cookies.map((cookie) => [cookie.name, cookie.value])),
    ),
    cookies,
    source:
      sourceProfile === resolveSourceProfile(undefined)
        ? "chrome-default"
        : sourceProfile,
    platform,
    encryption,
  };
}

function serializeCookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function resolveSourceProfile(override?: string): string {
  if (override) return override;
  const env = process.env.CHROME_SOURCE_PROFILE;
  if (env) return env;
  return path.join(resolveChromeUserDataRoot(), "Default");
}

export function resolveChromeUserDataRoot(override?: string): string {
  if (override) return override;
  const platform = process.platform as NodeJS.Platform;
  const home = homedir();
  switch (platform) {
    case "darwin":
      return path.join(
        home,
        "Library",
        "Application Support",
        "Google",
        "Chrome",
      );
    case "linux":
      return path.join(home, ".config", "google-chrome");
    case "win32":
      return path.join(
        process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"),
        "Google",
        "Chrome",
        "User Data",
      );
    default:
      return path.join(home, ".config", "google-chrome");
  }
}

export function listChromeProfiles(
  userDataRootOverride?: string,
): ChromeProfileDescriptor[] {
  const userDataRoot = resolveChromeUserDataRoot(userDataRootOverride);
  if (!existsSync(userDataRoot)) {
    return [];
  }

  const infoCache = readChromeInfoCache(userDataRoot);
  const profileDirNames = new Set<string>(["Default"]);

  for (const dirent of readdirSync(userDataRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    if (dirent.name === "Default" || /^Profile \d+$/.test(dirent.name)) {
      profileDirNames.add(dirent.name);
    }
  }

  return [...profileDirNames]
    .map((profileDirName) => {
      const meta = infoCache[profileDirName] || {};
      const profilePath = path.join(userDataRoot, profileDirName);
      if (!existsSync(findCookiesFile(profilePath))) {
        return null;
      }
      return {
        profileDirName,
        profilePath,
        userDataRoot,
        displayName:
          typeof meta.name === "string" && meta.name.trim().length > 0
            ? meta.name.trim()
            : profileDirName,
        userName:
          typeof meta.user_name === "string" && meta.user_name.trim().length > 0
            ? meta.user_name.trim()
            : null,
      } satisfies ChromeProfileDescriptor;
    })
    .filter((profile): profile is ChromeProfileDescriptor => profile !== null)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function extractDevinProfileAuth(
  sourceProfile: string,
): ExtractedDevinProfileAuth {
  const leveldbDir = path.join(sourceProfile, "Local Storage", "leveldb");
  if (!existsSync(leveldbDir)) {
    throw new CookieExtractError(
      "local_storage_missing",
      `Chrome Local Storage LevelDB not found at ${leveldbDir}`,
      "Open app.devin.ai in this Chrome profile once, then retry the import.",
    );
  }

  const candidateFiles = readdirSync(leveldbDir, { withFileTypes: true })
    .filter((dirent) => dirent.isFile() && /\.(ldb|log)$/i.test(dirent.name))
    .map((dirent) => path.join(leveldbDir, dirent.name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

  if (candidateFiles.length === 0) {
    throw new CookieExtractError(
      "local_storage_empty",
      `No Local Storage LevelDB files found in ${leveldbDir}`,
      "Open app.devin.ai in this Chrome profile once, then retry the import.",
    );
  }

  const haystack = candidateFiles
    .map((file) => readBinaryStrings(file))
    .join("\n");

  const rawToken =
    matchFirst(haystack, /auth1_[A-Za-z0-9_-]{20,}/) ||
    matchFirst(
      haystack,
      /uth1_token[\s\S]{0,160}?[^a-z0-9_-]*([a-z0-9_-]{20,})"/,
      1,
    ) ||
    matchFirst(
      haystack,
      /xuth1_session[\s\S]{0,220}?token":"a?[\s\n]*([a-z0-9_-]{20,})"/,
      1,
    );
  const orgId =
    matchFirst(haystack, /primary_org_id[\s\S]{0,120}?(org-[a-z0-9]+)/i, 1) ||
    matchFirst(haystack, /"orgId":"(org-[a-z0-9]+)"/i, 1);
  const userId =
    matchFirst(
      haystack,
      /xuth1_session[\s\S]{0,220}?userId":"([A-Za-z0-9_-]+)"/,
      1,
    ) || null;

  if (!rawToken) {
    throw new CookieExtractError(
      "auth_token_not_found",
      `Could not find Devin auth1 token in ${leveldbDir}`,
      "Open app.devin.ai in this Chrome profile, wait for it to fully load, then retry the import.",
    );
  }

  if (!orgId) {
    throw new CookieExtractError(
      "org_id_not_found",
      `Could not find Devin primary org id in ${leveldbDir}`,
      "Open app.devin.ai in this Chrome profile, switch into the target org if needed, then retry the import.",
    );
  }

  return {
    bearer: rawToken.startsWith("auth1_") ? rawToken : `auth1_${rawToken}`,
    orgId,
    rawToken,
    userId,
  };
}

function readChromeInfoCache(
  userDataRoot: string,
): Record<string, Record<string, unknown>> {
  const localStatePath = path.join(userDataRoot, "Local State");
  if (!existsSync(localStatePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(localStatePath, "utf8")) as Record<
      string,
      unknown
    >;
    const infoCache = (parsed.profile as Record<string, unknown> | undefined)
      ?.info_cache;
    return infoCache && typeof infoCache === "object"
      ? (infoCache as Record<string, Record<string, unknown>>)
      : {};
  } catch {
    return {};
  }
}

function findCookiesFile(profile: string): string {
  // Chrome 96+ moved the Cookies DB into a Network/ subdirectory.
  const candidates = [
    path.join(profile, "Network", "Cookies"),
    path.join(profile, "Cookies"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

type CookieRow = {
  name: string;
  value: string;
  encrypted_value: Buffer;
  host_key: string;
  path: string;
  expires_utc: number | null;
  is_httponly: number;
  is_secure: number;
};

function readCookieRows(cookiesFile: string, cookieName?: string): CookieRow[] {
  // We deliberately avoid taking a hard dependency on `better-sqlite3` so
  // the dashboard works without native modules. Instead we copy the DB to a
  // temp file (Chrome WAL locks the original) and parse it via the `sqlite3`
  // CLI, which is bundled on macOS and most Linux distros.
  //
  // The query selects only cookies for Devin hosts to keep the result set
  // small even if the user has thousands of cookies in their profile.
  const allowedHosts = Array.from(DEVIN_COOKIE_HOSTS)
    .map((h) => `'${h.replace(/'/g, "''")}'`)
    .join(",");
  const whereName = cookieName
    ? ` AND name = '${cookieName.replace(/'/g, "''")}'`
    : "";
  const sql = `SELECT name, value, hex(encrypted_value), host_key, path, expires_utc, is_httponly, is_secure FROM cookies WHERE host_key IN (${allowedHosts})${whereName} ORDER BY creation_utc DESC LIMIT 100;`;

  const tempDir = mkdtempSync(
    path.join(homedir(), ".devin-dashboard-cookie-db-"),
  );
  const tempDb = path.join(tempDir, "Cookies.sqlite");

  let stdout: string;
  try {
    copyFileSync(cookiesFile, tempDb);
    const result = execFileSync("sqlite3", [
      "-readonly",
      "-separator",
      "\t",
      tempDb,
      sql,
    ]);
    stdout = result.toString("utf8");
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "ENOENT") {
      throw new CookieExtractError(
        "sqlite3_missing",
        "The `sqlite3` CLI is not installed on this machine",
        "Install it via your package manager (macOS: `brew install sqlite`, Debian/Ubuntu: `sudo apt install sqlite3`, Windows: `winget install sqlite.sqlite`) and try again.",
      );
    }
    throw new CookieExtractError(
      "sqlite_query_failed",
      `Failed to read Chrome cookies DB: ${e?.message || "unknown"}`,
      "Make sure the Chrome profile is readable on this machine, then retry.",
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  const rows: CookieRow[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 8) continue;
    const [
      name,
      value,
      hexEnc,
      host_key,
      p,
      expiresStr,
      httpOnlyStr,
      secureStr,
    ] = parts;
    rows.push({
      name,
      value,
      encrypted_value: hexEnc ? Buffer.from(hexEnc, "hex") : Buffer.alloc(0),
      host_key,
      path: p,
      expires_utc: expiresStr ? Number(expiresStr) : null,
      is_httponly: Number(httpOnlyStr || 0),
      is_secure: Number(secureStr || 0),
    });
  }
  return rows;
}

function readBinaryStrings(filePath: string): string {
  try {
    return execFileSync("strings", [filePath], { encoding: "utf8" });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "ENOENT") {
      throw new CookieExtractError(
        "strings_missing",
        "The `strings` CLI is not installed on this machine",
        "Install the Xcode Command Line Tools or Binutils and retry the import.",
      );
    }
    throw new CookieExtractError(
      "strings_failed",
      `Failed to scan Local Storage file ${filePath}: ${e?.message || "unknown"}`,
      "Make sure the Chrome profile is readable on this machine, then retry.",
    );
  }
}

function matchFirst(
  haystack: string,
  pattern: RegExp,
  group = 0,
): string | null {
  const match = haystack.match(pattern);
  if (!match) return null;
  const value = match[group];
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function decryptValue(
  encryptedValue: Buffer,
  platform: NodeJS.Platform,
  hostKey?: string,
): Promise<{ plaintext: string; encryption: ExtractResult["encryption"] }> {
  const prefix = encryptedValue.subarray(0, 3).toString("utf8");

  if (platform === "darwin") {
    const password = await getMacosKeychainPassword();
    const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
    const iv = Buffer.alloc(16, 0x20);
    const plaintext = normalizeCookiePlaintext(
      aes128CbcDecrypt(encryptedValue.subarray(3), key, iv),
      hostKey,
    );
    return { plaintext, encryption: "macos-keychain" };
  }

  if (platform === "linux") {
    // Linux Chrome uses two key derivations depending on whether libsecret
    // gave Chrome a real password ("v11", PBKDF2 over the secret) or fell
    // back to "peanuts" ("v10", PBKDF2 over the literal string "peanuts").
    if (prefix === "v10") {
      const key = pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1");
      const iv = Buffer.alloc(16, 0x20);
      const plaintext = normalizeCookiePlaintext(
        aes128CbcDecrypt(encryptedValue.subarray(3), key, iv),
        hostKey,
      );
      return { plaintext, encryption: "linux-peanuts" };
    }
    if (prefix === "v11") {
      const password = await getLinuxLibsecretPassword();
      const key = pbkdf2Sync(password, "saltysalt", 1, 16, "sha1");
      const iv = Buffer.alloc(16, 0x20);
      const plaintext = normalizeCookiePlaintext(
        aes128CbcDecrypt(encryptedValue.subarray(3), key, iv),
        hostKey,
      );
      return { plaintext, encryption: "linux-libsecret" };
    }
    throw new CookieExtractError(
      "unsupported_linux_encryption",
      `Unknown Chrome cookie prefix: ${prefix}`,
      "Try manual paste instead — copy the cookie value from DevTools.",
    );
  }

  if (platform === "win32") {
    return decryptWindowsValue(encryptedValue);
  }

  throw new CookieExtractError(
    "unsupported_platform",
    `Auto-extract is not implemented for platform ${platform}`,
    "Use the manual paste fallback in the dashboard UI.",
  );
}

function aes128CbcDecrypt(ciphertext: Buffer, key: Buffer, iv: Buffer): string {
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);
  const buf = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  // PKCS#7 padding removal — last byte tells us how many bytes to strip.
  const pad = buf[buf.length - 1];
  const stripped =
    pad > 0 && pad <= 16 ? buf.subarray(0, buf.length - pad) : buf;
  return stripped.toString("latin1");
}

function normalizeCookiePlaintext(plaintext: string, hostKey?: string): string {
  let bytes = Buffer.from(plaintext, "latin1");

  if (hostKey && bytes.length > 32) {
    const domainHash = createHash("sha256").update(hostKey).digest();
    if (bytes.subarray(0, 32).equals(domainHash)) {
      bytes = bytes.subarray(32);
    }
  }

  return bytes.toString("utf8");
}

async function getMacosKeychainPassword(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-w",
      "-s",
      "Chrome Safe Storage",
    ]);
    return stdout.trim();
  } catch (err: unknown) {
    const message = (err as { message?: string })?.message || "unknown";
    throw new CookieExtractError(
      "keychain_access_denied",
      `Failed to read 'Chrome Safe Storage' from Keychain: ${message}`,
      "macOS may prompt for your login password the first time the dashboard accesses the Keychain — accept the prompt and retry.",
    );
  }
}

async function getLinuxLibsecretPassword(): Promise<string> {
  // Most Linux desktops install `secret-tool` (part of libsecret). It looks
  // up Chrome's cookie-encryption secret by its well-known attribute.
  try {
    const { stdout } = await execFileAsync("secret-tool", [
      "lookup",
      "application",
      "chrome",
    ]);
    const value = stdout.trim();
    if (value) return value;
  } catch {
    // fall through to chromium attribute
  }
  try {
    const { stdout } = await execFileAsync("secret-tool", [
      "lookup",
      "application",
      "chromium",
    ]);
    const value = stdout.trim();
    if (value) return value;
  } catch {
    // continue
  }
  throw new CookieExtractError(
    "libsecret_lookup_failed",
    "Could not read Chrome's cookie key from libsecret (Gnome Keyring / KWallet)",
    "Install `libsecret-tools` (`sudo apt install libsecret-tools`) and make sure your keyring is unlocked — or use manual paste.",
  );
}

async function decryptWindowsValue(
  encryptedValue: Buffer,
): Promise<{ plaintext: string; encryption: ExtractResult["encryption"] }> {
  // Windows: AES-256-GCM with a key wrapped by DPAPI. We shell out to a
  // tiny PowerShell snippet that unwraps the key + decrypts. Avoiding a
  // native module keeps the dashboard install-free on Windows.
  const localState = path.join(
    process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local"),
    "Google",
    "Chrome",
    "User Data",
    "Local State",
  );
  if (!existsSync(localState)) {
    throw new CookieExtractError(
      "local_state_missing",
      `Chrome Local State file not found at ${localState}`,
      "Open Chrome at least once to create the profile, then retry.",
    );
  }
  const parsed = JSON.parse(readFileSync(localState, "utf8"));
  const wrappedB64 = parsed?.os_crypt?.encrypted_key as string | undefined;
  if (!wrappedB64) {
    throw new CookieExtractError(
      "windows_no_encrypted_key",
      "Local State has no os_crypt.encrypted_key — unsupported Chrome version",
      "Try manual paste instead.",
    );
  }
  const wrapped = Buffer.from(wrappedB64, "base64");
  // First 5 bytes are the literal prefix "DPAPI".
  const dpapiBlob = wrapped.subarray(5);

  // Unwrap key via PowerShell DPAPI (current-user scope).
  const psScript = [
    "Add-Type -AssemblyName System.Security",
    "$blob = [System.Convert]::FromBase64String($env:DPAPI_BLOB)",
    "$key = [System.Security.Cryptography.ProtectedData]::Unprotect($blob, $null, 'CurrentUser')",
    "[System.Convert]::ToBase64String($key)",
  ].join("; ");
  let keyB64: string;
  try {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-Command", psScript],
      {
        env: { ...process.env, DPAPI_BLOB: dpapiBlob.toString("base64") },
      },
    );
    keyB64 = stdout.trim();
  } catch (err: unknown) {
    const message = (err as { message?: string })?.message || "unknown";
    throw new CookieExtractError(
      "dpapi_unwrap_failed",
      `PowerShell DPAPI unwrap failed: ${message}`,
      "Make sure you're running the dashboard as the same Windows user that owns the Chrome profile, then retry.",
    );
  }
  const key = Buffer.from(keyB64, "base64");

  // Chrome v10+ on Windows: encrypted_value = "v10" | nonce(12) | ciphertext | tag(16)
  const prefix = encryptedValue.subarray(0, 3).toString("utf8");
  if (prefix !== "v10") {
    throw new CookieExtractError(
      "windows_unsupported_prefix",
      `Unsupported Chrome cookie prefix on Windows: ${prefix}`,
      "Try manual paste.",
    );
  }
  const nonce = encryptedValue.subarray(3, 15);
  const tag = encryptedValue.subarray(encryptedValue.length - 16);
  const ct = encryptedValue.subarray(15, encryptedValue.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ct),
    decipher.final(),
  ]).toString("utf8");
  return { plaintext, encryption: "windows-dpapi" };
}
