/**
 * Score Devin accounts for routing, ordering, and supervisor decisions.
 *
 * Each account is scored on three dimensions:
 *   1. quota  — remaining daily + weekly headroom (0-50 points)
 *   2. lifecycle — credential validity, rate-limit, error state (0-30 points)
 *   3. repoReady — whether the account already has the target repo assigned (0-20 points)
 *
 * Higher total = better candidate for the next cloud worker task.
 *
 * Each account also carries a quota band. Lifecycle answers whether the
 * account can take work; quotaBand answers how close it is to checkpoint or
 * handoff territory.
 */

export type AccountQuotaInput = {
  dailyPercentage: number | null;
  weeklyPercentage: number | null;
};

export type AccountLifecycleInput = {
  hasCreds: boolean;
  needsBrowserRelink?: boolean;
  testStatus: string | null;
  rateLimitedUntil: string | null;
  lastError: string | null;
};

export type AccountRepoInput = {
  assignedRepoFullName: string | null;
  assignedBranch: string | null;
};

export type ScoredAccount = {
  accountId: string;
  name: string;
  score: number;
  quotaScore: number;
  lifecycleScore: number;
  repoScore: number;
  lifecycle: AccountLifecycle;
  quotaBand: QuotaBand;
  effectiveHeadroom: number | null;
  dailyPercentage: number | null;
  weeklyPercentage: number | null;
  assignedRepoFullName: string | null;
  disqualified: boolean;
  disqualifyReason: string | null;
};

export type AccountLifecycle =
  | "active"
  | "needs-relink"
  | "rate-limited"
  | "errored"
  | "exhausted"
  | "draining";

export type QuotaBand =
  | "unknown"
  | "healthy"
  | "draining"
  | "checkpoint"
  | "forced-handoff"
  | "stop-work"
  | "exhausted";

export type ScoreAccountInput = {
  id: string;
  name: string;
  quota: AccountQuotaInput | null;
  lifecycle: AccountLifecycleInput;
  repo: AccountRepoInput;
};

export type ScoreOptions = {
  targetRepo: string | null;
  now?: number;
};

export function scoreAccount(
  input: ScoreAccountInput,
  options: ScoreOptions,
): ScoredAccount {
  const lifecycle = resolveLifecycle(input.lifecycle, input.quota, options.now);
  const disqualified = lifecycle === "needs-relink"
    || lifecycle === "rate-limited"
    || lifecycle === "exhausted";
  const disqualifyReason = disqualified ? lifecycleDisqualifyReason(lifecycle, input.lifecycle) : null;

  const quotaScore = disqualified ? 0 : computeQuotaScore(input.quota);
  const lifecycleScore = computeLifecycleScore(lifecycle);
  const repoScore = computeRepoScore(input.repo, options.targetRepo);
  const score = disqualified ? 0 : quotaScore + lifecycleScore + repoScore;
  const headroom = effectiveHeadroom(input.quota);
  const quotaBand = computeQuotaBand(headroom);

  return {
    accountId: input.id,
    name: input.name,
    score,
    quotaScore,
    lifecycleScore,
    repoScore,
    lifecycle,
    quotaBand,
    effectiveHeadroom: headroom,
    dailyPercentage: input.quota?.dailyPercentage ?? null,
    weeklyPercentage: input.quota?.weeklyPercentage ?? null,
    assignedRepoFullName: input.repo.assignedRepoFullName,
    disqualified,
    disqualifyReason,
  };
}

export function rankAccounts(
  inputs: ScoreAccountInput[],
  options: ScoreOptions,
): ScoredAccount[] {
  return inputs
    .map((input) => scoreAccount(input, options))
    .sort((a, b) => {
      if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
      return b.score - a.score;
    });
}

export function resolveLifecycle(
  lc: AccountLifecycleInput,
  quota: AccountQuotaInput | null,
  now?: number,
): AccountLifecycle {
  if (!lc.hasCreds) return "needs-relink";
  if (lc.needsBrowserRelink) return "needs-relink";

  if (lc.rateLimitedUntil) {
    const until = new Date(lc.rateLimitedUntil).getTime();
    if (Number.isFinite(until) && until > (now ?? Date.now())) {
      return "rate-limited";
    }
  }

  if (quota) {
    const daily = quota.dailyPercentage;
    const weekly = quota.weeklyPercentage;
    if (daily !== null && daily <= 0) return "exhausted";
    if (weekly !== null && weekly <= 0) return "exhausted";
    if (weekly !== null && weekly <= 10) return "draining";
  }

  if (lc.lastError) return "errored";

  if (lc.testStatus === "valid" || lc.testStatus === "ok") return "active";

  return "active";
}

export function effectiveHeadroom(quota: AccountQuotaInput | null): number | null {
  if (!quota) return null;
  const daily = quota.dailyPercentage;
  const weekly = quota.weeklyPercentage;
  if (daily === null && weekly === null) return null;
  if (daily === null) return weekly;
  if (weekly === null) return daily;
  return Math.min(daily, weekly);
}

export function computeQuotaBand(headroomPercent: number | null): QuotaBand {
  if (headroomPercent === null) return "unknown";
  if (headroomPercent <= 0) return "exhausted";
  if (headroomPercent <= 2) return "stop-work";
  if (headroomPercent <= 5) return "forced-handoff";
  if (headroomPercent <= 10) return "checkpoint";
  if (headroomPercent <= 20) return "draining";
  return "healthy";
}

function computeQuotaScore(quota: AccountQuotaInput | null): number {
  if (!quota) return 25;
  const daily = clamp(quota.dailyPercentage ?? 100, 0, 100);
  const weekly = clamp(quota.weeklyPercentage ?? 100, 0, 100);
  const dailyPart = (daily / 100) * 30;
  const weeklyPart = (weekly / 100) * 20;
  return Math.round(dailyPart + weeklyPart);
}

function computeLifecycleScore(lifecycle: AccountLifecycle): number {
  switch (lifecycle) {
    case "active": return 30;
    case "draining": return 15;
    case "errored": return 10;
    case "needs-relink": return 0;
    case "rate-limited": return 0;
    case "exhausted": return 0;
  }
}

function computeRepoScore(
  repo: AccountRepoInput,
  targetRepo: string | null,
): number {
  if (!targetRepo) return 10;
  if (!repo.assignedRepoFullName) return 0;
  if (repo.assignedRepoFullName.toLowerCase() === targetRepo.toLowerCase()) return 20;
  return 0;
}

function lifecycleDisqualifyReason(lifecycle: AccountLifecycle, input: AccountLifecycleInput): string {
  switch (lifecycle) {
    case "needs-relink": return input.needsBrowserRelink ? "Browser session lost; relink login" : "Account credentials missing or expired";
    case "rate-limited": return "Account is rate-limited";
    case "exhausted": return "Quota fully exhausted";
    default: return "Unknown";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
