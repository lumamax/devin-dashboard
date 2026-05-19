/**
 * Read/write Devin connections.
 *
 * The dashboard is local-first: by default it stores accounts in its own
 * cross-platform local vault under DEVIN_DASHBOARD_HOME. OmniRoute support is
 * kept as an explicit legacy mode for migration and old private workflows.
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";
import {
  deleteLocalAccount,
  listLocalStoredAccounts,
  saveLocalAccount,
  updateLocalAccountCreds,
} from "@/lib/dashboardStore";
import { DevinCreds } from "./devinApi";

export type DevinLaunchContext = {
  launchStrategy: "user-data-dir" | "chrome-profile";
  userDataDir?: string;
  chromeUserDataDir?: string;
  chromeProfileDirectory?: string;
  profileName?: string;
  source?: string;
};

export type StoredDevinAccount = {
  id: string;
  name: string;
  priority: number | null;
  testStatus: string | null;
  rateLimitedUntil: string | null;
  lastError: string | null;
  creds: DevinCreds | null;
  rawApiKey: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  providerSpecificData: Record<string, unknown> | null;
  launchContext: DevinLaunchContext | null;
};

export type SaveAccountInput = {
  name: string;
  creds: DevinCreds;
  priority?: number;
  providerSpecificData?: Record<string, unknown> | null;
};

type JsonRecord = Record<string, unknown>;

export class MissingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingConfigError";
  }
}

function getEnv() {
  return {
    url: (process.env.OMNIROUTE_URL || "http://localhost:20128").replace(
      /\/+$/,
      "",
    ),
    token: process.env.OMNIROUTE_TOKEN || "",
  };
}

function getStoreMode(): "local" | "omniroute" {
  const raw = (process.env.DEVIN_DASHBOARD_STORE || "local").trim().toLowerCase();
  return raw === "omniroute" ? "omniroute" : "local";
}

function requireAuthedEnv() {
  const env = getEnv();
  if (!env.token.trim()) {
    throw new MissingConfigError(
      "OMNIROUTE_TOKEN is not set. Add a providers:write token in .env.local before saving Devin accounts."
    );
  }
  return env;
}

function getDbPath(): string {
  return (
    process.env.OMNIROUTE_DB_PATH ||
    path.join(homedir(), ".omniroute", "storage.sqlite")
  );
}

export async function listStoredAccounts(): Promise<StoredDevinAccount[]> {
  if (getStoreMode() === "local") {
    return listLocalStoredAccounts();
  }

  try {
    const apiAccounts = await listStoredAccountsViaApi();
    if (apiAccounts.length > 0) {
      return apiAccounts;
    }

    const directAccounts = listStoredAccountsDirectSafe(
      "[connectionStore] OmniRoute API list returned zero devin-web rows; checking SQLite fallback.",
    );
    if (directAccounts && directAccounts.length > 0) {
      return directAccounts;
    }

    return apiAccounts;
  } catch (error) {
    console.warn("[connectionStore] OmniRoute API list failed, falling back to SQLite:", error);
    const directAccounts = listStoredAccountsDirectSafe(
      "[connectionStore] OmniRoute API list failed and SQLite fallback is the only remaining source.",
    );
    if (directAccounts) {
      return directAccounts;
    }
    throw error;
  }
}

export async function getStoredAccount(
  id: string,
): Promise<StoredDevinAccount | null> {
  const all = await listStoredAccounts();
  return all.find((a) => a.id === id) || null;
}

export async function saveAccount(
  input: SaveAccountInput,
): Promise<{ id: string }> {
  if (getStoreMode() === "local") {
    return saveLocalAccount(input);
  }

  try {
    return await saveAccountViaApi(input);
  } catch (error) {
    if (error instanceof MissingConfigError) throw error;
    console.warn("[connectionStore] OmniRoute API save failed, falling back to SQLite:", error);
    return saveAccountDirect(input);
  }
}

export async function updateAccountCreds(
  id: string,
  creds: DevinCreds,
  providerSpecificData?: Record<string, unknown> | null,
  updates: { name?: string; priority?: number } = {},
): Promise<void> {
  if (getStoreMode() === "local") {
    updateLocalAccountCreds(id, creds, providerSpecificData, updates);
    return;
  }

  try {
    const saved = await updateAccountViaApi(id, creds, providerSpecificData, updates);
    if (saved) return;
  } catch (error) {
    if (error instanceof MissingConfigError) throw error;
    console.warn("[connectionStore] OmniRoute API credential update failed, falling back to SQLite:", error);
  }
  updateAccountDirect(id, creds, providerSpecificData, updates);
}

export async function deleteStoredAccount(id: string): Promise<boolean> {
  if (getStoreMode() === "local") {
    return deleteLocalAccount(id) !== null;
  }

  try {
    return await deleteAccountViaApi(id);
  } catch (error) {
    if (error instanceof MissingConfigError) throw error;
    console.warn("[connectionStore] OmniRoute API delete failed, falling back to SQLite:", error);
  }

  return deleteAccountDirect(id);
}

async function listStoredAccountsViaApi(): Promise<StoredDevinAccount[]> {
  const { url } = getEnv();
  const res = await fetch(`${url}/api/providers/client`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `OmniRoute GET /api/providers/client failed: ${res.status}`,
    );
  }
  const json = (await res.json()) as unknown;
  const rows = extractRows(json);
  return rows
    .filter((r) => (r.provider as string) === "devin-web")
    .map(normalize);
}

async function saveAccountViaApi(
  input: SaveAccountInput,
): Promise<{ id: string }> {
  const { url, token } = requireAuthedEnv();
  const body = {
    provider: "devin-web",
    name: input.name,
    priority: input.priority ?? 50,
    apiKey: serializeCreds(input.creds),
    providerSpecificData: input.providerSpecificData || undefined,
    testStatus: "valid",
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${url}/api/providers`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `OmniRoute POST /api/providers failed: ${res.status} ${text.slice(0, 300)}`,
    );
  }

  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    connection?: { id?: string };
  };
  const id = json.id || json.connection?.id;
  if (!id) {
    throw new Error("OmniRoute returned no id for the new connection");
  }
  return { id };
}

async function updateAccountViaApi(
  id: string,
  creds: DevinCreds,
  providerSpecificData?: Record<string, unknown> | null,
  updates: { name?: string; priority?: number } = {},
): Promise<boolean> {
  const { url, token } = requireAuthedEnv();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const body: JsonRecord = {
    apiKey: serializeCreds(creds),
    testStatus: "valid",
    isActive: true,
  };
  if (providerSpecificData !== undefined) {
    body.providerSpecificData = providerSpecificData;
  }
  if (updates.name) {
    body.name = updates.name;
  }
  if (typeof updates.priority === "number") {
    body.priority = updates.priority;
  }

  const res = await fetch(`${url}/api/providers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `OmniRoute PATCH /api/providers/${id} failed: ${res.status} ${text.slice(0, 300)}`,
    );
  }

  return true;
}

async function deleteAccountViaApi(id: string): Promise<boolean> {
  const { url, token } = requireAuthedEnv();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${url}/api/providers/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers,
    cache: "no-store",
  });

  if (res.status === 404) return false;
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `OmniRoute DELETE /api/providers/${id} failed: ${res.status} ${text.slice(0, 300)}`,
    );
  }

  return true;
}

function listStoredAccountsDirect(): StoredDevinAccount[] {
  const rows = runSqlJson(
    `SELECT * FROM provider_connections WHERE provider = 'devin-web' ORDER BY priority ASC, updated_at DESC`,
  );
  return rows.map(normalize);
}

function listStoredAccountsDirectSafe(message: string): StoredDevinAccount[] | null {
  try {
    return listStoredAccountsDirect();
  } catch (error) {
    console.warn(message, error);
    return null;
  }
}

function saveAccountDirect(input: SaveAccountInput): { id: string } {
  const accounts = listStoredAccountsDirect();
  const incomingLaunchContext = parseLaunchContext(
    input.providerSpecificData || null,
  );
  const existing = accounts.find((account) => {
    if (sameLaunchContext(account.launchContext, incomingLaunchContext)) {
      return true;
    }

    return Boolean(
      account.creds &&
      account.creds.bearer === input.creds.bearer &&
      account.creds.orgId === input.creds.orgId,
    );
  });

  if (existing) {
    updateAccountDirect(existing.id, input.creds, input.providerSpecificData, {
      name: input.name,
      priority: input.priority,
    });
    return { id: existing.id };
  }

  const nextPriority =
    input.priority ?? Math.max(50, ...accounts.map((a) => a.priority ?? 0)) + 1;
  const id = randomUUID();
  const now = new Date().toISOString();
  const providerSpecificData = input.providerSpecificData
    ? JSON.stringify(input.providerSpecificData)
    : null;

  runSqlCommand(`
    INSERT INTO provider_connections (
      id, provider, auth_type, name, priority, is_active, test_status,
      api_key, provider_specific_data, created_at, updated_at
    ) VALUES (
      ${sqlString(id)}, 'devin-web', 'apikey', ${sqlString(input.name)}, ${nextPriority}, 1, 'valid',
      ${sqlString(serializeCreds(input.creds))}, ${sqlValue(providerSpecificData)}, ${sqlString(now)}, ${sqlString(now)}
    )
  `);

  return { id };
}

function updateAccountDirect(
  id: string,
  creds: DevinCreds,
  providerSpecificData?: Record<string, unknown> | null,
  extras?: { name?: string; priority?: number },
): void {
  const now = new Date().toISOString();
  const updates = [
    `api_key = ${sqlString(serializeCreds(creds))}`,
    `test_status = 'valid'`,
    `is_active = 1`,
    `updated_at = ${sqlString(now)}`,
  ];

  if (providerSpecificData !== undefined) {
    updates.push(
      `provider_specific_data = ${sqlValue(JSON.stringify(providerSpecificData))}`,
    );
  }
  if (extras?.name) {
    updates.push(`name = ${sqlString(extras.name)}`);
  }
  if (typeof extras?.priority === "number") {
    updates.push(`priority = ${extras.priority}`);
  }

  runSqlCommand(`
    UPDATE provider_connections
    SET ${updates.join(", ")}
    WHERE id = ${sqlString(id)}
  `);
}

function deleteAccountDirect(id: string): boolean {
  runSqlCommand(`
    DELETE FROM provider_connections
    WHERE provider = 'devin-web' AND id = ${sqlString(id)}
  `);
  return true;
}

function runSqlJson(sql: string): JsonRecord[] {
  const output = execFileSync("sqlite3", ["-json", getDbPath(), sql], {
    encoding: "utf8",
  }).trim();
  if (!output) return [];
  return JSON.parse(output) as JsonRecord[];
}

function runSqlCommand(sql: string): void {
  execFileSync("sqlite3", [getDbPath(), sql], { encoding: "utf8" });
}

function extractRows(json: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(json)) return json as Array<Record<string, unknown>>;
  if (json && typeof json === "object") {
    const candidate = (json as Record<string, unknown>).connections;
    if (Array.isArray(candidate))
      return candidate as Array<Record<string, unknown>>;
  }
  return [];
}

function normalize(row: Record<string, unknown>): StoredDevinAccount {
  const apiKey =
    (row.apiKey as string | null | undefined) ??
    (row.api_key as string | null | undefined) ??
    null;
  const providerSpecificData = parseProviderSpecificData(
    row.providerSpecificData ?? row.provider_specific_data ?? null,
  );

  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? row.alias ?? row.id ?? ""),
    priority: toNumberOrNull(row.priority),
    testStatus: toStringOrNull(row.testStatus ?? row.test_status),
    rateLimitedUntil: toStringOrNull(
      row.rateLimitedUntil ?? row.rate_limited_until,
    ),
    lastError: toStringOrNull(row.lastError ?? row.last_error),
    creds: parseCreds(apiKey),
    rawApiKey: apiKey,
    createdAt: toStringOrNull(row.createdAt ?? row.created_at),
    updatedAt: toStringOrNull(row.updatedAt ?? row.updated_at),
    providerSpecificData,
    launchContext: parseLaunchContext(providerSpecificData),
  };
}

function parseCreds(apiKey: string | null): DevinCreds | null {
  if (!apiKey) return null;
  try {
    const parsed = JSON.parse(apiKey) as Record<string, unknown>;
    if (
      parsed &&
      parsed.kind === "devin-web-creds" &&
      typeof parsed.bearer === "string"
    ) {
      return {
        cookie: String(parsed.cookie || ""),
        bearer: String(parsed.bearer),
        orgId: String(parsed.orgId || ""),
      };
    }
  } catch {
    // Legacy format: bare cookie string.
  }
  return null;
}

function parseProviderSpecificData(
  value: unknown,
): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseLaunchContext(
  providerSpecificData: Record<string, unknown> | null,
): DevinLaunchContext | null {
  const raw = providerSpecificData?.devinDashboard;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const launchStrategy = (raw as Record<string, unknown>).launchStrategy;
  if (
    launchStrategy !== "user-data-dir" &&
    launchStrategy !== "chrome-profile"
  ) {
    return null;
  }

  return {
    launchStrategy,
    userDataDir:
      toStringOrNull((raw as Record<string, unknown>).userDataDir) || undefined,
    chromeUserDataDir:
      toStringOrNull((raw as Record<string, unknown>).chromeUserDataDir) ||
      undefined,
    chromeProfileDirectory:
      toStringOrNull((raw as Record<string, unknown>).chromeProfileDirectory) ||
      undefined,
    profileName:
      toStringOrNull((raw as Record<string, unknown>).profileName) || undefined,
    source:
      toStringOrNull((raw as Record<string, unknown>).source) || undefined,
  };
}

function sameLaunchContext(
  left: DevinLaunchContext | null,
  right: DevinLaunchContext | null,
): boolean {
  if (!left || !right) return false;
  if (left.launchStrategy !== right.launchStrategy) return false;

  if (left.launchStrategy === "user-data-dir") {
    return Boolean(left.userDataDir && left.userDataDir === right.userDataDir);
  }

  return Boolean(
    left.chromeUserDataDir &&
    left.chromeUserDataDir === right.chromeUserDataDir &&
    left.chromeProfileDirectory &&
    left.chromeProfileDirectory === right.chromeProfileDirectory,
  );
}

function serializeCreds(creds: DevinCreds): string {
  return JSON.stringify({
    version: 1,
    kind: "devin-web-creds",
    cookie: creds.cookie,
    bearer: creds.bearer,
    orgId: creds.orgId,
    capturedAt: new Date().toISOString(),
  });
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlValue(value: string | null): string {
  return value === null ? "NULL" : sqlString(value);
}
