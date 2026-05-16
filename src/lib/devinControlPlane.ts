import {
  getStoredAccount,
  MissingConfigError,
  updateAccountCreds,
} from "@/lib/connectionStore";
import { randomBytes } from "node:crypto";
import { DevinApiError, devinGet, devinGetText, devinPost } from "@/lib/devinApi";

type JsonRecord = Record<string, unknown>;

export type DevinSessionLatestStatus = {
  enum: string | null;
  message: string | null;
  timestamp: string | null;
  userActionRequired: boolean | null;
};

export type DevinSessionSummary = {
  devinId: string;
  title: string | null;
  status: string | null;
  activityStatus: string | null;
  currentActivity: string | null;
  maxAcuLimit: number | null;
  sessionOrigin: string | null;
  isArchived: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  tags: string[];
  latestStatus: DevinSessionLatestStatus | null;
  raw: JsonRecord;
};

export type DevinSessionPullRequest = {
  id: string | null;
  number: number | null;
  title: string | null;
  url: string | null;
  state: string | null;
  raw: JsonRecord;
};

export type DevinEventExcerpt = {
  type: string;
  timestamp: string | null;
  createdAtMs: number | null;
  eventId: string | null;
  message: string | null;
  summary: string | null;
  status: string | null;
  command: string | null;
  query: string | null;
  completedCount: number | null;
  pendingCount: number | null;
  inProgressCount: number | null;
};

export type DevinSessionEventSummary = {
  totalItems: number;
  counts: Record<string, number>;
  latestStatus: DevinEventExcerpt | null;
  latestDevinMessage: DevinEventExcerpt | null;
  latestUserMessage: DevinEventExcerpt | null;
  latestThought: DevinEventExcerpt | null;
  latestTodoUpdate: DevinEventExcerpt | null;
  latestCommands: DevinEventExcerpt[];
  items: DevinEventExcerpt[];
};

export type DevinSessionListOptions = {
  limit?: number;
  includeArchived?: boolean;
  mineOnly?: boolean;
  updatedDateFrom?: string | null;
};

export type DevinSessionEventOptions = {
  order?: "asc" | "desc";
  take?: number;
};

export type DevinSessionStartOptions = {
  prompt: string;
  modelOverride?: string | null;
  tags?: string[];
  repos?: JsonRecord[];
};

export type DevinStartedSession = {
  sessionId: string;
  username: string;
  modelOverride: string | null;
  payload: JsonRecord;
  response: JsonRecord;
};

export async function listAccountSessions(
  accountId: string,
  options: DevinSessionListOptions = {},
): Promise<{ sessions: DevinSessionSummary[]; currentUserId: string | null }> {
  const transport = await createStoredAccountTransport(accountId);
  const currentUserId = options.mineOnly ? await transport.resolveCurrentUserId() : null;
  const path = buildSessionListPath(transport.account.creds!.orgId, {
    limit: options.limit,
    includeArchived: options.includeArchived,
    updatedDateFrom: options.updatedDateFrom,
    creatorUserId: options.mineOnly ? currentUserId : null,
  });
  const data = await transport.getJson<unknown>(path);
  const sessions = extractSessionRows(data).map(normalizeSessionSummary);
  return { sessions, currentUserId };
}

export async function getAccountSession(
  accountId: string,
  sessionId: string,
): Promise<DevinSessionSummary> {
  const transport = await createStoredAccountTransport(accountId);
  const data = await transport.getJson<JsonRecord>(`/api/sessions/${encodeURIComponent(sessionId)}`);
  return normalizeSessionSummary(data);
}

export async function getAccountSessionPullRequests(
  accountId: string,
  sessionId: string,
): Promise<DevinSessionPullRequest[]> {
  const transport = await createStoredAccountTransport(accountId);
  const data = await transport.getJson<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}/prs`);
  return extractList(data).map(normalizePullRequest);
}

export async function getAccountSessionEvents(
  accountId: string,
  sessionId: string,
  options: DevinSessionEventOptions = {},
): Promise<DevinSessionEventSummary> {
  const transport = await createStoredAccountTransport(accountId);
  const params = new URLSearchParams();
  params.set("order", options.order || "desc");
  const text = await transport.getText(
    `/api/events/${encodeURIComponent(sessionId)}/stream?${params.toString()}`,
  );
  return summarizeSessionEventFeed(text, options.take || 60);
}

export async function startAccountSession(
  accountId: string,
  options: DevinSessionStartOptions,
): Promise<DevinStartedSession> {
  const transport = await createStoredAccountTransport(accountId);
  const username = await transport.resolveUsername();
  const modelCandidates = options.modelOverride ? [options.modelOverride, null] : [null];
  let lastError: Error | null = null;

  for (const modelOverride of modelCandidates) {
    const sessionId = createDevinSessionId();
    const payload = buildSessionStartRequest({
      sessionId,
      prompt: options.prompt,
      username,
      modelOverride,
      tags: options.tags || [],
      repos: options.repos || [],
    });

    try {
      const response = await transport.postJson<JsonRecord>("/api/sessions", payload);
      return {
        sessionId,
        username,
        modelOverride,
        payload,
        response,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error("Failed to start Devin session");
}

async function createStoredAccountTransport(accountId: string) {
  const account = await getStoredAccount(accountId);
  if (!account) {
    throw new Error("Account not found");
  }
  if (!account.creds?.bearer || !account.creds.orgId) {
    throw new Error("Stored account is missing structured Devin web credentials");
  }

  let currentCreds = account.creds;

  const onRefresh = async (next: typeof account.creds) => {
    if (!next) return;
    currentCreds = next;
    try {
      await updateAccountCreds(account.id, next);
    } catch (error) {
      if (error instanceof MissingConfigError) return;
      throw error;
    }
  };

  const getJson = async <T>(path: string): Promise<T> => {
    const result = await devinGet<T>(path, currentCreds, onRefresh);
    if (!result.ok) throw result.error;
    return result.data;
  };

  const getText = async (path: string): Promise<string> => {
    const result = await devinGetText(path, currentCreds, onRefresh);
    if (!result.ok) throw result.error;
    return result.data;
  };

  const postJson = async <T>(path: string, body: unknown): Promise<T> => {
    const result = await devinPost<T>(path, body, currentCreds, onRefresh);
    if (!result.ok) throw result.error;
    return result.data;
  };

  return {
    account,
    getJson,
    getText,
    postJson,
    async resolveCurrentUserId(): Promise<string | null> {
      const info = await getJson<JsonRecord>("/api/users/info");
      return extractCurrentUserId(info);
    },
    async resolveUsername(): Promise<string> {
      const info = await getJson<JsonRecord>("/api/users/info").catch(() => null);
      const resolvedFromInfo = info ? extractUsername(info) : null;
      if (resolvedFromInfo) return resolvedFromInfo;

      const recentSessions = await getJson<unknown>(
        buildSessionListPath(currentCreds.orgId, {
          limit: 5,
          includeArchived: false,
          creatorUserId: info ? extractCurrentUserId(info) : null,
        }),
      ).catch(() => null);
      const resolvedFromSessions = extractUsernameFromSessionHistory(recentSessions);
      if (resolvedFromSessions) return resolvedFromSessions;

      throw new Error("Could not resolve Devin username from /api/users/info or recent sessions");
    },
  };
}

function buildSessionListPath(
  orgId: string,
  options: {
    limit?: number;
    includeArchived?: boolean;
    updatedDateFrom?: string | null;
    creatorUserId?: string | null;
  },
) {
  const params = new URLSearchParams();
  params.set("include_pinned", "true");
  params.set("group_children", "true");
  params.set("limit", String(clampInteger(options.limit, 30, 1, 100)));
  params.set("order_by", "updated_at");
  params.set("sort_direction", "desc");
  params.set("is_archived", options.includeArchived ? "true" : "false");
  params.set("hide_automations", "true");
  params.set("session_type", "devin");
  if (options.updatedDateFrom) {
    params.set("updated_date_from", options.updatedDateFrom);
  }
  if (options.creatorUserId) {
    params.set("creators", options.creatorUserId);
  }
  return `/api/${encodeURIComponent(orgId)}/v2sessions?${params.toString()}`;
}

export function buildSessionStartRequest(input: {
  sessionId: string;
  prompt: string;
  username: string;
  modelOverride?: string | null;
  tags?: string[];
  repos?: JsonRecord[];
}): JsonRecord {
  const additionalArgs: JsonRecord = {
    planning_mode: "automatic",
    planner_type: "fast",
    from_spaces: "false",
    bypass_approval: false,
  };
  if (input.modelOverride) {
    additionalArgs.devin_version_override = input.modelOverride;
  }

  return {
    devin_id: input.sessionId,
    user_message: input.prompt,
    username: input.username,
    snapshot_id: null,
    additional_args: additionalArgs,
    repos: input.repos || [],
    tags: input.tags || [],
    rich_content: [{ text: input.prompt }],
  };
}

function createDevinSessionId(): string {
  return `devin-${randomBytes(16).toString("hex")}`;
}

export function extractSessionRows(payload: unknown): JsonRecord[] {
  const direct = extractList(payload);
  if (direct.length > 0) return direct;
  if (payload && typeof payload === "object") {
    const obj = payload as JsonRecord;
    for (const key of ["result", "sessions", "items", "results", "data"]) {
      const nested = extractList(obj[key]);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

export function normalizeSessionSummary(row: JsonRecord): DevinSessionSummary {
  return {
    devinId: readString(row, ["devin_id", "session_id", "id"]) || "",
    title: readString(row, ["title"]),
    status: readString(row, ["status"]),
    activityStatus: readString(row, ["activity_status"]),
    currentActivity: readString(row, ["current_activity"]),
    maxAcuLimit: readNumber(row, ["max_acu_limit"]),
    sessionOrigin: readString(row, ["session_origin"]),
    isArchived: readBoolean(row, ["is_archived"]),
    createdAt: readString(row, ["created_at"]),
    updatedAt: readString(row, ["updated_at"]),
    tags: readStringArray(row.tags),
    latestStatus: normalizeLatestStatus(row.latest_status ?? row.latest_status_contents),
    raw: row,
  };
}

function normalizeLatestStatus(value: unknown): DevinSessionLatestStatus | null {
  if (!value || typeof value !== "object") return null;
  const row = value as JsonRecord;
  return {
    enum: readString(row, ["enum", "status"]),
    message: readString(row, ["message"]),
    timestamp: readString(row, ["timestamp"]),
    userActionRequired: readBoolean(row, ["user_action_required", "user_action_required_present"]),
  };
}

function normalizePullRequest(row: JsonRecord): DevinSessionPullRequest {
  return {
    id: readString(row, ["id", "pr_id"]),
    number: readNumber(row, ["number", "pr_number"]),
    title: readString(row, ["title"]),
    url: readString(row, ["url", "html_url"]),
    state: readString(row, ["state", "status"]),
    raw: row,
  };
}

export function summarizeSessionEventFeed(
  rawText: string,
  maxItems = 60,
): DevinSessionEventSummary {
  const parsed = parseEventPayload(rawText);
  const counts: Record<string, number> = {};
  const items = parsed.map(normalizeEventExcerpt);

  for (const item of items) {
    counts[item.type] = (counts[item.type] || 0) + 1;
  }

  return {
    totalItems: items.length,
    counts,
    latestStatus: items.find((item) => item.type === "status_update") || null,
    latestDevinMessage: items.find((item) => item.type === "devin_message") || null,
    latestUserMessage: items.find((item) => item.type === "user_message" || item.type === "initial_user_message") || null,
    latestThought: items.find((item) => item.type === "devin_thoughts" || item.type === "one_line_thoughts") || null,
    latestTodoUpdate: items.find((item) => item.type === "todo_update") || null,
    latestCommands: items
      .filter((item) => item.type === "shell_process_started" || item.type === "search_file_commands")
      .slice(0, 5),
    items: items.slice(0, clampInteger(maxItems, 60, 1, 200)),
  };
}

export function parseEventPayload(rawText: string): JsonRecord[] {
  const out: JsonRecord[] = [];
  const source = String(rawText || "").trim();
  if (!source) return out;

  try {
    flattenEventValue(JSON.parse(source), out);
    if (out.length > 0) {
      return out;
    }
  } catch {
    // fall back to line-by-line parsing for NDJSON-style feeds
  }

  for (const chunk of source.split(/\r?\n/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    try {
      flattenEventValue(JSON.parse(trimmed), out);
    } catch {
      continue;
    }
  }
  return out;
}

function flattenEventValue(value: unknown, out: JsonRecord[]) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) flattenEventValue(item, out);
    return;
  }
  if (typeof value !== "object") return;

  const row = value as JsonRecord;
  for (const key of ["result", "events", "items", "data"]) {
    if (Array.isArray(row[key])) {
      flattenEventValue(row[key], out);
      return;
    }
  }

  if (
    typeof row.type === "string" ||
    typeof row.event_id === "string" ||
    typeof row.created_at_ms === "number"
  ) {
    out.push(row);
  }
}

function normalizeEventExcerpt(row: JsonRecord): DevinEventExcerpt {
  return {
    type: readString(row, ["type"]) || "unknown",
    timestamp: readString(row, ["timestamp"]),
    createdAtMs: readNumber(row, ["created_at_ms"]),
    eventId: readString(row, ["event_id"]),
    message: readString(row, ["message"]),
    summary: readString(row, ["summary", "short"]),
    status: readString(row, ["enum", "status"]),
    command: readCommand(row),
    query: readString(row, ["query"]),
    completedCount: readNumber(row, ["completed_count"]),
    pendingCount: readNumber(row, ["pending_count"]),
    inProgressCount: readNumber(row, ["in_progress_count"]),
  };
}

function readCommand(row: JsonRecord): string | null {
  const direct = row.command;
  if (typeof direct === "string") return direct;
  if (Array.isArray(direct)) {
    const parts = direct.filter((item): item is string => typeof item === "string" && item.length > 0);
    return parts.length > 0 ? parts.join(" ") : null;
  }
  const searchCommands = Array.isArray(row.search_commands)
    ? row.search_commands.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  return searchCommands.length > 0 ? searchCommands.join(" | ") : null;
}

function extractCurrentUserId(info: JsonRecord): string | null {
  return readString(info, ["user_id", "id"])
    || readNestedString(info, ["user", "id"])
    || readNestedString(info, ["user", "user_id"])
    || null;
}

function extractUsername(info: JsonRecord): string | null {
  const direct = readString(info, ["username", "github_username", "githubUsername", "login", "handle"]);
  if (direct) return direct;

  for (const key of ["user", "current_user", "viewer", "data"]) {
    const nested = info[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const resolved = extractUsername(nested as JsonRecord);
      if (resolved) return resolved;
    }
  }

  return null;
}

export function extractUsernameFromSessionHistory(payload: unknown): string | null {
  for (const row of extractSessionRows(payload)) {
    const resolved = extractUsernameFromSessionRow(row);
    if (resolved) return resolved;
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return extractUsernameFromSessionRow(payload as JsonRecord);
  }

  return null;
}

function extractUsernameFromSessionRow(row: JsonRecord): string | null {
  const direct = readNestedString(row, ["latest_loop_contents", "username"])
    || readNestedString(row, ["initial_user_message_contents", "username"])
    || readNestedString(row, ["latest_message_contents", "username"]);
  if (direct) return direct;

  const email = readNestedString(row, ["initial_user_message_contents", "email"]);
  if (email && email.includes("@")) {
    const localPart = email.split("@")[0]?.trim();
    if (localPart) return localPart;
  }

  return null;
}

function extractList(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function readString(obj: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function readNestedString(obj: JsonRecord, path: string[]): string | null {
  let current: unknown = obj;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as JsonRecord)[key];
  }
  return typeof current === "string" && current.length > 0 ? current : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readNumber(obj: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function readBoolean(obj: JsonRecord, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}

export function toRouteErrorPayload(error: unknown) {
  if (error instanceof DevinApiError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: error.message,
        code: "devin_api_error",
        detail: error.bodyText,
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      code: "internal_error",
    },
  };
}
