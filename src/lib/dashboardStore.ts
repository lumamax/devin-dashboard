import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import type {
  DevinLaunchContext,
  SaveAccountInput,
  StoredDevinAccount,
} from "@/lib/connectionStore";
import type { DevinCreds } from "@/lib/devinApi";

type JsonRecord = Record<string, unknown>;

type DashboardStoreFile = {
  version: 1;
  accounts: StoredDevinAccount[];
};

const STORE_VERSION = 1;

export function getDashboardHome(): string {
  const override = process.env.DEVIN_DASHBOARD_HOME?.trim();
  if (override) return path.resolve(override);

  const home = homedir();
  if (platform() === "win32") {
    return path.join(
      process.env.APPDATA || path.join(home, "AppData", "Roaming"),
      "devin-dashboard",
    );
  }

  return path.join(home, ".devin-dashboard");
}

export function getDisplayDashboardHome(): string {
  if (process.env.DEVIN_DASHBOARD_HOME?.trim()) {
    return process.env.DEVIN_DASHBOARD_HOME.trim();
  }

  return platform() === "win32"
    ? "%APPDATA%\\devin-dashboard"
    : "~/.devin-dashboard";
}

export function getDashboardStorePath(): string {
  const override = process.env.DEVIN_DASHBOARD_STORE_PATH?.trim();
  return override ? path.resolve(override) : path.join(getDashboardHome(), "dashboard.json");
}

export function listLocalStoredAccounts(): StoredDevinAccount[] {
  return readStore().accounts.sort(compareAccounts);
}

export function saveLocalAccount(input: SaveAccountInput): { id: string } {
  const store = readStore();
  const incomingLaunchContext = parseLaunchContext(input.providerSpecificData || null);
  const existingIndex = store.accounts.findIndex((account) => {
    if (sameLaunchContext(account.launchContext, incomingLaunchContext)) return true;
    return Boolean(
      account.creds &&
        account.creds.bearer === input.creds.bearer &&
        account.creds.orgId === input.creds.orgId,
    );
  });

  if (existingIndex >= 0) {
    const existing = store.accounts[existingIndex]!;
    store.accounts[existingIndex] = buildUpdatedAccount(existing, input.creds, {
      providerSpecificData:
        input.providerSpecificData === undefined
          ? existing.providerSpecificData
          : input.providerSpecificData,
      name: input.name,
      priority: input.priority,
    });
    writeStore(store);
    return { id: existing.id };
  }

  const now = new Date().toISOString();
  const nextPriority =
    input.priority ?? Math.max(50, ...store.accounts.map((account) => account.priority ?? 0)) + 1;
  const account: StoredDevinAccount = {
    id: randomUUID(),
    name: input.name,
    priority: nextPriority,
    testStatus: "valid",
    rateLimitedUntil: null,
    lastError: null,
    creds: input.creds,
    rawApiKey: serializeCreds(input.creds),
    createdAt: now,
    updatedAt: now,
    providerSpecificData: input.providerSpecificData || null,
    launchContext: parseLaunchContext(input.providerSpecificData || null),
  };

  store.accounts.push(account);
  writeStore(store);
  return { id: account.id };
}

export function updateLocalAccountCreds(
  id: string,
  creds: DevinCreds,
  providerSpecificData?: Record<string, unknown> | null,
): void {
  const store = readStore();
  const index = store.accounts.findIndex((account) => account.id === id);
  if (index < 0) {
    throw new Error(`Account not found: ${id}`);
  }

  const existing = store.accounts[index]!;
  store.accounts[index] = buildUpdatedAccount(existing, creds, {
    providerSpecificData:
      providerSpecificData === undefined ? existing.providerSpecificData : providerSpecificData,
  });
  writeStore(store);
}

export function replaceLocalStoredAccounts(accounts: StoredDevinAccount[]): void {
  const normalized = accounts
    .map((account) => normalizeLocalAccount(account))
    .filter((account): account is StoredDevinAccount => account !== null)
    .sort(compareAccounts);
  writeStore({ version: STORE_VERSION, accounts: normalized });
}

function readStore(): DashboardStoreFile {
  const storePath = getDashboardStorePath();
  if (!existsSync(storePath)) {
    return { version: STORE_VERSION, accounts: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(storePath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `Failed to read Devin Dashboard store at ${storePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid Devin Dashboard store at ${storePath}: expected JSON object`);
  }

  const record = parsed as JsonRecord;
  const accounts = Array.isArray(record.accounts)
    ? record.accounts
        .map((value) => normalizeLocalAccount(value))
        .filter((value): value is StoredDevinAccount => value !== null)
    : [];

  return { version: STORE_VERSION, accounts };
}

function writeStore(store: DashboardStoreFile): void {
  const storePath = getDashboardStorePath();
  const dir = path.dirname(storePath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = path.join(
    dir,
    `${path.basename(storePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(tmpPath, storePath);
}

function normalizeLocalAccount(value: unknown): StoredDevinAccount | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as JsonRecord;
  const id = toStringOrNull(record.id);
  if (!id) return null;

  const providerSpecificData = parseProviderSpecificData(record.providerSpecificData);
  const creds = parseStoredCreds(record.creds, toStringOrNull(record.rawApiKey));

  return {
    id,
    name: toStringOrNull(record.name) || id,
    priority: toNumberOrNull(record.priority),
    testStatus: toStringOrNull(record.testStatus),
    rateLimitedUntil: toStringOrNull(record.rateLimitedUntil),
    lastError: toStringOrNull(record.lastError),
    creds,
    rawApiKey: toStringOrNull(record.rawApiKey) || (creds ? serializeCreds(creds) : null),
    createdAt: toStringOrNull(record.createdAt),
    updatedAt: toStringOrNull(record.updatedAt),
    providerSpecificData,
    launchContext: parseLaunchContext(providerSpecificData),
  };
}

function buildUpdatedAccount(
  existing: StoredDevinAccount,
  creds: DevinCreds,
  updates: {
    providerSpecificData?: Record<string, unknown> | null;
    name?: string;
    priority?: number;
  },
): StoredDevinAccount {
  const providerSpecificData =
    updates.providerSpecificData === undefined
      ? existing.providerSpecificData
      : updates.providerSpecificData;

  return {
    ...existing,
    name: updates.name || existing.name,
    priority: typeof updates.priority === "number" ? updates.priority : existing.priority,
    testStatus: "valid",
    creds,
    rawApiKey: serializeCreds(creds),
    updatedAt: new Date().toISOString(),
    providerSpecificData: providerSpecificData || null,
    launchContext: parseLaunchContext(providerSpecificData || null),
  };
}

function parseStoredCreds(value: unknown, rawApiKey: string | null): DevinCreds | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as JsonRecord;
    const bearer = toStringOrNull(record.bearer);
    if (bearer) {
      return {
        cookie: toStringOrNull(record.cookie) || "",
        bearer,
        orgId: toStringOrNull(record.orgId) || "",
      };
    }
  }

  if (!rawApiKey) return null;
  try {
    const parsed = JSON.parse(rawApiKey) as JsonRecord;
    if (parsed.kind === "devin-web-creds" && typeof parsed.bearer === "string") {
      return {
        cookie: String(parsed.cookie || ""),
        bearer: String(parsed.bearer),
        orgId: String(parsed.orgId || ""),
      };
    }
  } catch {
    return null;
  }
  return null;
}

function parseProviderSpecificData(value: unknown): Record<string, unknown> | null {
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
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const launchStrategy = (raw as JsonRecord).launchStrategy;
  if (launchStrategy !== "user-data-dir" && launchStrategy !== "chrome-profile") {
    return null;
  }

  return {
    launchStrategy,
    userDataDir: toStringOrNull((raw as JsonRecord).userDataDir) || undefined,
    chromeUserDataDir:
      toStringOrNull((raw as JsonRecord).chromeUserDataDir) || undefined,
    chromeProfileDirectory:
      toStringOrNull((raw as JsonRecord).chromeProfileDirectory) || undefined,
    profileName: toStringOrNull((raw as JsonRecord).profileName) || undefined,
    source: toStringOrNull((raw as JsonRecord).source) || undefined,
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

function compareAccounts(left: StoredDevinAccount, right: StoredDevinAccount): number {
  const leftPriority = left.priority ?? Number.MAX_SAFE_INTEGER;
  const rightPriority = right.priority ?? Number.MAX_SAFE_INTEGER;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  return toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt);
}

function toTimestamp(value: string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
