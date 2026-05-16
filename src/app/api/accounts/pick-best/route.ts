/**
 * GET /api/accounts/pick-best — score and rank stored Devin accounts.
 *
 * Fetches all stored accounts, enriches each with live quota data,
 * scores them by usable quota, lifecycle state, and repo readiness,
 * then returns the ranked list with the best pick highlighted.
 *
 * Query params:
 *   targetRepo — optional "owner/repo" to boost accounts already assigned
 */

import { NextRequest, NextResponse } from "next/server";
import { listStoredAccounts } from "@/lib/connectionStore";
import { devinGet } from "@/lib/devinApi";
import {
  rankAccounts,
  type AccountQuotaInput,
  type ScoreAccountInput,
} from "@/lib/accountScorer";

type JsonRecord = Record<string, unknown>;

export async function GET(request: NextRequest) {
  const targetRepo = request.nextUrl.searchParams.get("targetRepo") || null;

  try {
    const accounts = await listStoredAccounts();
    const quotaResults = await Promise.allSettled(
      accounts.map((account) => fetchQuotaForScoring(account)),
    );

    const inputs: ScoreAccountInput[] = accounts.map((account, index) => {
      const quotaResult = quotaResults[index];
      const quota: AccountQuotaInput | null =
        quotaResult.status === "fulfilled" ? quotaResult.value : null;

      const repoAssignment = readRepoAssignment(account.providerSpecificData);

      return {
        id: account.id,
        name: account.name,
        quota,
        lifecycle: {
          hasCreds: account.creds !== null,
          testStatus: account.testStatus,
          rateLimitedUntil: account.rateLimitedUntil,
          lastError: account.lastError,
        },
        repo: {
          assignedRepoFullName: repoAssignment?.fullName || null,
          assignedBranch: repoAssignment?.branch || null,
        },
      };
    });

    const ranked = rankAccounts(inputs, { targetRepo });
    const best = ranked.find((r) => !r.disqualified) || null;

    return NextResponse.json({
      ok: true,
      best: best ? { accountId: best.accountId, name: best.name, score: best.score } : null,
      ranked,
      targetRepo,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

async function fetchQuotaForScoring(
  account: { creds: { bearer: string; orgId: string; cookie: string } | null },
): Promise<AccountQuotaInput | null> {
  if (!account.creds?.bearer || !account.creds.orgId) return null;

  const result = await devinGet<JsonRecord>(
    `/api/${account.creds.orgId}/billing/quota/usage`,
    account.creds,
  );

  if (!result.ok) return null;

  const data = result.data;
  return {
    dailyPercentage: toAvailablePercentage(pickNumber(data, ["daily_percentage"])),
    weeklyPercentage: toAvailablePercentage(pickNumber(data, ["weekly_percentage"])),
  };
}

function toAvailablePercentage(usedPercentage: number | null): number | null {
  if (usedPercentage === null) return null;
  return Math.max(0, 100 - usedPercentage);
}

function pickNumber(obj: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
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
      ? `${(record.owner as string).trim()}/${(record.repo as string).trim()}`
      : null;
  const branch = typeof record.branch === "string" && record.branch.trim() ? record.branch.trim() : null;

  if (!fullName) return null;
  return { fullName, branch };
}
