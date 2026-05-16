import { rankAccounts, type AccountQuotaInput, type ScoredAccount, type ScoreAccountInput } from "@/lib/accountScorer";
import type { StoredDevinAccount } from "@/lib/connectionStore";
import { readRepoAssignment } from "@/lib/dashboardRepoState";
import { devinGet } from "@/lib/devinApi";

type JsonRecord = Record<string, unknown>;

export async function rankStoredAccounts(
  accounts: StoredDevinAccount[],
  targetRepo: string | null = null,
): Promise<ScoredAccount[]> {
  const quotaResults = await Promise.allSettled(accounts.map((account) => fetchQuotaForScoring(account)));

  const inputs: ScoreAccountInput[] = accounts.map((account, index) => {
    const quotaResult = quotaResults[index];
    const quota: AccountQuotaInput | null = quotaResult.status === "fulfilled" ? quotaResult.value : null;
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

  return rankAccounts(inputs, { targetRepo });
}

export async function orderStoredAccountsByHealth(
  accounts: StoredDevinAccount[],
): Promise<StoredDevinAccount[]> {
  const ranked = await rankStoredAccounts(accounts, null);
  const order = new Map(ranked.map((row, index) => [row.accountId, index]));

  return accounts.slice().sort((left, right) => {
    const leftRank = order.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = order.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftPriority = left.priority ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = right.priority ?? Number.MAX_SAFE_INTEGER;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.name.localeCompare(right.name);
  });
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

  return {
    dailyPercentage: toAvailablePercentage(pickNumber(result.data, ["daily_percentage"])),
    weeklyPercentage: toAvailablePercentage(pickNumber(result.data, ["weekly_percentage"])),
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
