import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
  listStoredAccounts,
  type StoredDevinAccount,
  updateAccountCreds,
  MissingConfigError,
} from "@/lib/connectionStore";
import { devinGet } from "@/lib/devinApi";
import {
  listAccountSessions,
  type DevinSessionSummary,
} from "@/lib/devinControlPlane";
import {
  findExistingDebugPort,
  seedPromptViaCdpToSession,
} from "@/lib/devinSessionSeeder";
import {
  rankAccounts,
  resolveLifecycle,
  type AccountQuotaInput,
  type ScoreAccountInput,
  type ScoredAccount,
} from "@/lib/accountScorer";

type JsonRecord = Record<string, unknown>;

const DEFAULT_INTERVAL_MS = 3 * 60 * 1000;
const ACTION_RETRY_MS = 30 * 60 * 1000;

export type SupervisorQuotaBand =
  | "unknown"
  | "healthy"
  | "draining"
  | "checkpoint"
  | "force"
  | "stop"
  | "exhausted";

export type SupervisorActionKind = "none" | "checkpoint" | "force" | "stop";

export type SupervisorPaths = {
  rootDir: string;
  statePath: string;
  latestPath: string;
  eventsPath: string;
};

export type SupervisorActionAttempt = {
  kind: SupervisorActionKind;
  prompt: string | null;
  attempted: boolean;
  ok: boolean;
  delivery: "none" | "dry-run" | "cdp" | "alert-only";
  reason: string | null;
};

export type SupervisorSuccessor = {
  accountId: string;
  name: string;
  score: number;
  lifecycle: string;
  dailyPercentage: number | null;
  weeklyPercentage: number | null;
};

export type SupervisorAccountSnapshot = {
  accountId: string;
  name: string;
  repoFullName: string | null;
  branch: string | null;
  hasCreds: boolean;
  lifecycle: string;
  quotaError: string | null;
  dailyRemaining: number | null;
  weeklyRemaining: number | null;
  effectiveRemaining: number | null;
  band: SupervisorQuotaBand;
  resetAt: string | null;
  currentSessionId: string | null;
  currentSessionTitle: string | null;
  currentSessionStatus: string | null;
  suggestedSuccessor: SupervisorSuccessor | null;
  action: SupervisorActionAttempt;
  transitioned: boolean;
};

export type SupervisorTickResult = {
  ranAt: string;
  dryRun: boolean;
  accounts: SupervisorAccountSnapshot[];
  interesting: string[];
  paths: SupervisorPaths;
};

type SupervisorQuotaSnapshot = {
  quotaError: string | null;
  dailyRemaining: number | null;
  weeklyRemaining: number | null;
  effectiveRemaining: number | null;
  band: SupervisorQuotaBand;
  resetAt: string | null;
};

type SupervisorAccountState = {
  band: SupervisorQuotaBand;
  lastSeenAt: string | null;
  lastSessionId: string | null;
  lastRepoFullName: string | null;
  actions: Partial<Record<Exclude<SupervisorActionKind, "none">, {
    at: string;
    sessionId: string | null;
    delivery: SupervisorActionAttempt["delivery"];
    ok: boolean;
  }>>;
};

type SupervisorState = {
  version: 1;
  updatedAt: string | null;
  accounts: Record<string, SupervisorAccountState>;
};

export type RunSupervisorTickOptions = {
  dryRun?: boolean;
  paths?: Partial<SupervisorPaths>;
};

export type RunSupervisorLoopOptions = RunSupervisorTickOptions & {
  intervalMs?: number;
};

export function resolveSupervisorPaths(overrides: Partial<SupervisorPaths> = {}): SupervisorPaths {
  const rootDir = overrides.rootDir
    || process.env.DEVIN_SUPERVISOR_HOME
    || path.join(homedir(), ".devin-dashboard");
  return {
    rootDir,
    statePath: overrides.statePath || process.env.DEVIN_SUPERVISOR_STATE_PATH || path.join(rootDir, "supervisor-state.json"),
    latestPath: overrides.latestPath || process.env.DEVIN_SUPERVISOR_LATEST_PATH || path.join(rootDir, "supervisor-latest.json"),
    eventsPath: overrides.eventsPath || process.env.DEVIN_SUPERVISOR_EVENTS_PATH || path.join(rootDir, "supervisor-events.ndjson"),
  };
}

export function classifyQuotaBand(effectiveRemaining: number | null): SupervisorQuotaBand {
  if (effectiveRemaining === null || !Number.isFinite(effectiveRemaining)) return "unknown";
  if (effectiveRemaining <= 0) return "exhausted";
  if (effectiveRemaining <= 2) return "stop";
  if (effectiveRemaining <= 5) return "force";
  if (effectiveRemaining <= 10) return "checkpoint";
  if (effectiveRemaining <= 20) return "draining";
  return "healthy";
}

export function summarizeQuotaUsage(usageInput: unknown): SupervisorQuotaSnapshot {
  const usage = usageInput && typeof usageInput === "object" && !Array.isArray(usageInput)
    ? usageInput as JsonRecord
    : null;
  const dailyUsed = pickNumber(usage, ["daily_percentage"]);
  const weeklyUsed = pickNumber(usage, ["weekly_percentage"]);
  const dailyRemaining = toAvailablePercentage(dailyUsed);
  const weeklyRemaining = toAvailablePercentage(weeklyUsed);
  const effectiveRemaining = pickEffectiveHeadroom(dailyRemaining, weeklyRemaining);
  const resetAt = pickString(usage, [
    "daily_reset_at",
    "weekly_reset_at",
    "reset_at",
    "next_reset_at",
    "resets_at",
    "period_end",
  ]);

  return {
    quotaError: null,
    dailyRemaining,
    weeklyRemaining,
    effectiveRemaining,
    band: classifyQuotaBand(effectiveRemaining),
    resetAt,
  };
}

export function buildQuotaInterventionPrompt(input: {
  action: Exclude<SupervisorActionKind, "none">;
  accountName: string;
  repoFullName: string | null;
  branch: string | null;
  sessionId: string | null;
  dailyRemaining: number | null;
  weeklyRemaining: number | null;
  effectiveRemaining: number | null;
  successor: SupervisorSuccessor | null;
}): string {
  const headroom = formatHeadroom(input.dailyRemaining, input.weeklyRemaining, input.effectiveRemaining);
  const repoLine = input.repoFullName
    ? `Repo: ${input.repoFullName}${input.branch ? ` | Branch: ${input.branch}` : ""}.`
    : "Repo assignment is not visible in the dashboard.";
  const successorLine = input.successor
    ? `Suggested next account if you must hand off: ${input.successor.name} (${input.successor.accountId}).`
    : "No clear successor is currently assigned.";
  const sessionLine = input.sessionId ? `Current session: ${input.sessionId}.` : "";

  if (input.action === "checkpoint") {
    return [
      `Supervisor notice for ${input.accountName}: remaining Devin quota headroom is low (${headroom}).`,
      "Do not start a broad new task.",
      "Finish the current safe slice, run only the minimum relevant checks, then commit and push your current branch.",
      "Update docs/handoffs/LATEST.md with exact git state, what is done, what remains, and the single next best action.",
      repoLine,
      successorLine,
      sessionLine,
    ].filter(Boolean).join(" ");
  }

  if (input.action === "force") {
    return [
      `Supervisor notice for ${input.accountName}: remaining Devin quota headroom is now in the forced handoff zone (${headroom}).`,
      "Stop starting new implementation immediately.",
      "Create the cleanest possible checkpoint now: commit or stash only what is needed, push the working branch, and update docs/handoffs/LATEST.md before doing anything else.",
      "After the handoff is durable in GitHub, stop and wait for rotation.",
      repoLine,
      successorLine,
      sessionLine,
    ].filter(Boolean).join(" ");
  }

  return [
    `Emergency supervisor notice for ${input.accountName}: remaining Devin quota headroom is critically low (${headroom}).`,
    "Stop new work now.",
    "Only finalize sync: capture git state, push whatever safe checkpoint is possible, and write the handoff.",
    "If a test is too long, skip it and say it was not run. Do not begin another coding slice.",
    repoLine,
    successorLine,
    sessionLine,
  ].filter(Boolean).join(" ");
}

export function selectActionableSession(sessions: DevinSessionSummary[]): DevinSessionSummary | null {
  if (sessions.length === 0) return null;
  return [...sessions].sort((left, right) => scoreSession(right) - scoreSession(left))[0] || null;
}

export async function runSupervisorTick(
  options: RunSupervisorTickOptions = {},
): Promise<SupervisorTickResult> {
  const dryRun = Boolean(options.dryRun);
  const paths = resolveSupervisorPaths(options.paths || {});
  await mkdir(paths.rootDir, { recursive: true });

  const ranAt = new Date().toISOString();
  const previous = await readState(paths.statePath);
  const accounts = await listStoredAccounts();
  const quotaRows = await Promise.all(accounts.map((account) => fetchQuotaForAccount(account)));

  const base = accounts.map((account, index) => {
    const quota = quotaRows[index]!;
    const repoAssignment = readRepoAssignment(account.providerSpecificData);
    const lifecycle = resolveLifecycle(
      {
        hasCreds: account.creds !== null,
        testStatus: account.testStatus,
        rateLimitedUntil: account.rateLimitedUntil,
        lastError: account.lastError,
      },
      {
        dailyPercentage: quota.dailyRemaining,
        weeklyPercentage: quota.weeklyRemaining,
      },
    );

    return {
      account,
      lifecycle,
      repoFullName: repoAssignment?.fullName || null,
      branch: repoAssignment?.branch || null,
      quota,
    };
  });

  const lowAccounts = base.filter((row) =>
    row.account.creds
    && row.repoFullName
    && ["checkpoint", "force", "stop", "exhausted"].includes(row.quota.band),
  );

  const sessionsByAccount = new Map<string, DevinSessionSummary[]>();
  await Promise.all(lowAccounts.map(async (row) => {
    try {
      const sessionList = await listAccountSessions(row.account.id, { limit: 8, mineOnly: true });
      sessionsByAccount.set(row.account.id, sessionList.sessions);
    } catch {
      sessionsByAccount.set(row.account.id, []);
    }
  }));

  const snapshotsPreAction = base.map((row) => {
    const currentSession = selectActionableSession(sessionsByAccount.get(row.account.id) || []);
    const suggestedSuccessor = shouldSuggestSuccessor(row.quota.effectiveRemaining)
      ? recommendSuccessor(row.account.id, row.repoFullName, base)
      : null;

    return {
      accountId: row.account.id,
      name: row.account.name,
      repoFullName: row.repoFullName,
      branch: row.branch,
      hasCreds: row.account.creds !== null,
      lifecycle: row.lifecycle,
      quotaError: row.quota.quotaError,
      dailyRemaining: row.quota.dailyRemaining,
      weeklyRemaining: row.quota.weeklyRemaining,
      effectiveRemaining: row.quota.effectiveRemaining,
      band: row.quota.band,
      resetAt: row.quota.resetAt,
      currentSessionId: currentSession?.devinId || null,
      currentSessionTitle: currentSession?.title || null,
      currentSessionStatus: currentSession?.status || currentSession?.latestStatus?.enum || null,
      suggestedSuccessor,
      transitioned: (previous.accounts[row.account.id]?.band || "unknown") !== row.quota.band,
    };
  });

  const nextState: SupervisorState = {
    version: 1,
    updatedAt: ranAt,
    accounts: {},
  };
  const interesting: string[] = [];
  const finalSnapshots: SupervisorAccountSnapshot[] = [];

  for (const snapshot of snapshotsPreAction) {
    const prev = previous.accounts[snapshot.accountId];
    const action = await maybeRunSupervisorAction(snapshot, prev, dryRun, ranAt, base);
    finalSnapshots.push({ ...snapshot, action });

    if (snapshot.transitioned) {
      interesting.push(describeTransition(snapshot, prev?.band || "unknown"));
    }
    if (action.kind !== "none" && (action.attempted || snapshot.transitioned)) {
      interesting.push(describeAction(snapshot, action));
    }

    nextState.accounts[snapshot.accountId] = {
      band: snapshot.band,
      lastSeenAt: ranAt,
      lastSessionId: snapshot.currentSessionId,
      lastRepoFullName: snapshot.repoFullName,
      actions: mergeActionState(prev?.actions, snapshot.currentSessionId, ranAt, action),
    };
  }

  await writeFile(paths.statePath, JSON.stringify(nextState, null, 2) + "\n", "utf8");
  await writeFile(paths.latestPath, JSON.stringify({ ranAt, dryRun, accounts: finalSnapshots }, null, 2) + "\n", "utf8");
  if (interesting.length > 0) {
    const lines = interesting.map((line) => JSON.stringify({ ranAt, message: line })).join("\n") + "\n";
    await appendFile(paths.eventsPath, lines, "utf8");
  }

  return {
    ranAt,
    dryRun,
    accounts: finalSnapshots,
    interesting,
    paths,
  };
}

export async function runSupervisorLoop(
  options: RunSupervisorLoopOptions = {},
): Promise<never> {
  const intervalMs = Math.max(30_000, options.intervalMs || DEFAULT_INTERVAL_MS);

  while (true) {
    try {
      await runSupervisorTick(options);
    } catch (error) {
      const now = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${now}] supervisor tick failed: ${message}`);
    }

    await sleep(intervalMs);
  }
}

async function maybeRunSupervisorAction(
  snapshot: Omit<SupervisorAccountSnapshot, "action">,
  previous: SupervisorAccountState | undefined,
  dryRun: boolean,
  ranAt: string,
  base: Array<{
    account: StoredDevinAccount;
    lifecycle: string;
    repoFullName: string | null;
    branch: string | null;
    quota: SupervisorQuotaSnapshot;
  }>,
): Promise<SupervisorActionAttempt> {
  const actionKind = decideActionKind(snapshot.band);
  if (actionKind === "none") {
    return {
      kind: "none",
      prompt: null,
      attempted: false,
      ok: false,
      delivery: "none",
      reason: null,
    };
  }

  const prompt = buildQuotaInterventionPrompt({
    action: actionKind,
    accountName: snapshot.name,
    repoFullName: snapshot.repoFullName,
    branch: snapshot.branch,
    sessionId: snapshot.currentSessionId,
    dailyRemaining: snapshot.dailyRemaining,
    weeklyRemaining: snapshot.weeklyRemaining,
    effectiveRemaining: snapshot.effectiveRemaining,
    successor: snapshot.suggestedSuccessor,
  });

  if (!shouldAttemptAction(previous, actionKind, snapshot.currentSessionId, ranAt)) {
    return {
      kind: actionKind,
      prompt,
      attempted: false,
      ok: false,
      delivery: "alert-only",
      reason: "action_already_recently_attempted",
    };
  }

  if (!snapshot.currentSessionId) {
    return {
      kind: actionKind,
      prompt,
      attempted: true,
      ok: false,
      delivery: dryRun ? "dry-run" : "alert-only",
      reason: "no_actionable_session_found",
    };
  }

  const account = base.find((row) => row.account.id === snapshot.accountId)?.account || null;
  const userDataDir = readLaunchUserDataDir(account?.launchContext || null);
  if (!userDataDir) {
    return {
      kind: actionKind,
      prompt,
      attempted: true,
      ok: false,
      delivery: dryRun ? "dry-run" : "alert-only",
      reason: "account_has_no_dashboard_managed_profile",
    };
  }

  const debugPort = findExistingDebugPort(userDataDir);
  if (!debugPort) {
    return {
      kind: actionKind,
      prompt,
      attempted: true,
      ok: false,
      delivery: dryRun ? "dry-run" : "alert-only",
      reason: "debug_port_unavailable",
    };
  }

  if (dryRun) {
    return {
      kind: actionKind,
      prompt,
      attempted: true,
      ok: true,
      delivery: "dry-run",
      reason: `would_send_via_cdp:${debugPort}`,
    };
  }

  const sent = await seedPromptViaCdpToSession({
    chromePort: debugPort,
    prompt,
    sessionId: snapshot.currentSessionId,
    timeoutMs: 18_000,
  });

  return {
    kind: actionKind,
    prompt,
    attempted: true,
    ok: sent.ok,
    delivery: sent.ok ? "cdp" : "alert-only",
    reason: sent.reason,
  };
}

function readLaunchUserDataDir(launchContext: StoredDevinAccount["launchContext"]): string | null {
  if (!launchContext) return null;
  if (launchContext.launchStrategy === "user-data-dir") {
    return launchContext.userDataDir || null;
  }
  if (launchContext.launchStrategy === "chrome-profile") {
    return launchContext.chromeUserDataDir || null;
  }
  return null;
}

function decideActionKind(band: SupervisorQuotaBand): SupervisorActionKind {
  if (band === "checkpoint") return "checkpoint";
  if (band === "force") return "force";
  if (band === "stop" || band === "exhausted") return "stop";
  return "none";
}

function shouldSuggestSuccessor(effectiveRemaining: number | null): boolean {
  return effectiveRemaining !== null && effectiveRemaining <= 7;
}

function recommendSuccessor(
  currentAccountId: string,
  targetRepo: string | null,
  base: Array<{
    account: StoredDevinAccount;
    lifecycle: string;
    repoFullName: string | null;
    branch: string | null;
    quota: SupervisorQuotaSnapshot;
  }>,
): SupervisorSuccessor | null {
  const inputs: ScoreAccountInput[] = base.map((row) => ({
    id: row.account.id,
    name: row.account.name,
    quota: {
      dailyPercentage: row.quota.dailyRemaining,
      weeklyPercentage: row.quota.weeklyRemaining,
    },
    lifecycle: {
      hasCreds: row.account.creds !== null,
      testStatus: row.account.testStatus,
      rateLimitedUntil: row.account.rateLimitedUntil,
      lastError: row.account.lastError,
    },
    repo: {
      assignedRepoFullName: row.repoFullName,
      assignedBranch: row.branch,
    },
  }));

  const ranked = rankAccounts(inputs, { targetRepo });
  const next = ranked.find((candidate) => candidate.accountId !== currentAccountId && !candidate.disqualified) || null;
  return next ? toSuccessor(next) : null;
}

function toSuccessor(candidate: ScoredAccount): SupervisorSuccessor {
  return {
    accountId: candidate.accountId,
    name: candidate.name,
    score: candidate.score,
    lifecycle: candidate.lifecycle,
    dailyPercentage: candidate.dailyPercentage,
    weeklyPercentage: candidate.weeklyPercentage,
  };
}

function describeTransition(
  snapshot: Omit<SupervisorAccountSnapshot, "action">,
  previousBand: SupervisorQuotaBand,
): string {
  const repoLabel = snapshot.repoFullName || "unassigned";
  return `${snapshot.name} moved ${previousBand} -> ${snapshot.band} on ${repoLabel} (${formatHeadroom(snapshot.dailyRemaining, snapshot.weeklyRemaining, snapshot.effectiveRemaining)})`;
}

function describeAction(
  snapshot: Omit<SupervisorAccountSnapshot, "action">,
  action: SupervisorActionAttempt,
): string {
  const target = snapshot.currentSessionId || "no-session";
  const base = `${snapshot.name} ${action.kind} action for ${target}`;
  if (!action.attempted) {
    return `${base} pending (${action.reason || "not_attempted"})`;
  }
  return action.ok
    ? `${base} delivered via ${action.delivery}`
    : `${base} not delivered (${action.reason || action.delivery})`;
}

function mergeActionState(
  previous: SupervisorAccountState["actions"] | undefined,
  sessionId: string | null,
  ranAt: string,
  action: SupervisorActionAttempt,
): SupervisorAccountState["actions"] {
  const next = {
    checkpoint: previous?.checkpoint,
    force: previous?.force,
    stop: previous?.stop,
  };

  if (action.kind !== "none" && action.attempted) {
    next[action.kind] = {
      at: ranAt,
      sessionId,
      delivery: action.delivery,
      ok: action.ok,
    };
  }

  return next;
}

function shouldAttemptAction(
  previous: SupervisorAccountState | undefined,
  kind: Exclude<SupervisorActionKind, "none">,
  sessionId: string | null,
  ranAt: string,
): boolean {
  const last = previous?.actions[kind];
  if (!last) return true;
  if (last.sessionId !== sessionId) return true;
  const previousAt = Date.parse(last.at);
  const currentAt = Date.parse(ranAt);
  if (!Number.isFinite(previousAt) || !Number.isFinite(currentAt)) return true;
  return currentAt - previousAt >= ACTION_RETRY_MS;
}

async function fetchQuotaForAccount(account: StoredDevinAccount): Promise<SupervisorQuotaSnapshot> {
  if (!account.creds?.bearer || !account.creds.orgId) {
    return {
      quotaError: account.creds ? "stored_credentials_missing_org" : "needs_relink",
      dailyRemaining: null,
      weeklyRemaining: null,
      effectiveRemaining: null,
      band: "unknown",
      resetAt: null,
    };
  }

  let currentCreds = account.creds;
  const onRefresh = async (next: typeof account.creds) => {
    if (!next) return;
    currentCreds = next;
    try {
      await updateAccountCreds(account.id, next, account.providerSpecificData);
    } catch (error) {
      if (error instanceof MissingConfigError) return;
      throw error;
    }
  };

  const result = await devinGet<JsonRecord>(
    `/api/${account.creds.orgId}/billing/quota/usage`,
    currentCreds,
    onRefresh,
  );

  if (!result.ok) {
    return {
      quotaError: result.error.message,
      dailyRemaining: null,
      weeklyRemaining: null,
      effectiveRemaining: null,
      band: "unknown",
      resetAt: null,
    };
  }

  return summarizeQuotaUsage(result.data);
}

async function readState(statePath: string): Promise<SupervisorState> {
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<SupervisorState>;
    if (parsed && parsed.version === 1 && parsed.accounts && typeof parsed.accounts === "object") {
      return {
        version: 1,
        updatedAt: parsed.updatedAt || null,
        accounts: parsed.accounts as SupervisorState["accounts"],
      };
    }
  } catch {
    // ignore missing or invalid state
  }

  return {
    version: 1,
    updatedAt: null,
    accounts: {},
  };
}

function readRepoAssignment(providerSpecificData: Record<string, unknown> | null) {
  const dashboard = providerSpecificData?.devinDashboard;
  if (!dashboard || typeof dashboard !== "object" || Array.isArray(dashboard)) {
    return null;
  }

  const repoAssignment = (dashboard as Record<string, unknown>).repoAssignment;
  if (!repoAssignment || typeof repoAssignment !== "object" || Array.isArray(repoAssignment)) {
    return null;
  }

  const record = repoAssignment as Record<string, unknown>;
  const fullName = typeof record.fullName === "string" && record.fullName.trim()
    ? record.fullName.trim()
    : typeof record.owner === "string" && typeof record.repo === "string"
      ? `${record.owner.trim()}/${record.repo.trim()}`
      : null;
  const branch = typeof record.branch === "string" && record.branch.trim() ? record.branch.trim() : null;
  if (!fullName) return null;
  return { fullName, branch };
}

function scoreSession(session: DevinSessionSummary): number {
  let score = 0;
  if (session.latestStatus?.userActionRequired) score += 400;
  if (matchesAny(session.status, ["running", "active", "working"])) score += 300;
  if (matchesAny(session.activityStatus, ["coding", "planning", "blocked", "pr"])) score += 120;
  if (matchesAny(session.status, ["finished", "archived", "deleted"])) score -= 250;
  const updatedAt = Date.parse(session.updatedAt || "");
  if (Number.isFinite(updatedAt)) score += Math.floor(updatedAt / 60000);
  return score;
}

function matchesAny(value: string | null, patterns: string[]): boolean {
  const normalized = (value || "").toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function pickEffectiveHeadroom(dailyRemaining: number | null, weeklyRemaining: number | null): number | null {
  const values = [dailyRemaining, weeklyRemaining].filter((value): value is number => value !== null && Number.isFinite(value));
  if (values.length === 0) return null;
  return Math.min(...values);
}

function toAvailablePercentage(usedPercentage: number | null): number | null {
  if (usedPercentage === null) return null;
  return Math.max(0, Math.min(100, 100 - usedPercentage));
}

function pickNumber(obj: JsonRecord | null, keys: string[]): number | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  }
  return null;
}

function pickString(obj: JsonRecord | null, keys: string[]): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function formatHeadroom(
  dailyRemaining: number | null,
  weeklyRemaining: number | null,
  effectiveRemaining: number | null,
): string {
  return [
    `daily ${formatPercent(dailyRemaining)}`,
    `weekly ${formatPercent(weeklyRemaining)}`,
    `effective ${formatPercent(effectiveRemaining)}`,
  ].join(", ");
}

function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "n/a" : `${Math.round(value)}%`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
