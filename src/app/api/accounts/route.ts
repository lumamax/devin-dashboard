import { NextResponse } from "next/server";
import { orderStoredAccountsByHealth } from "@/lib/accountOrdering";
import { listStoredAccounts } from "@/lib/connectionStore";
import { readPreparedRepos, readRepoAssignment } from "@/lib/dashboardRepoState";

export async function GET() {
  try {
    const stored = await listStoredAccounts();
    const ordered = await orderStoredAccountsByHealth(stored).catch(() => stored);
    const safe = ordered.map((account) => {
      const repoAssignment = readRepoAssignment(account.providerSpecificData);
      const preparedRepos = readPreparedRepos(account.providerSpecificData).map((repo) => ({
        fullName: repo.repoFullName,
        branch: repo.branch,
        sessionId: repo.sessionId,
        updatedAt: repo.updatedAt,
      }));

      return {
        id: account.id,
        name: account.name,
        priority: account.priority,
        testStatus: account.testStatus,
        rateLimitedUntil: account.rateLimitedUntil,
        lastError: account.lastError,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        hasCreds: account.creds !== null,
        orgId: account.creds?.orgId || null,
        assignedRepoFullName: repoAssignment?.fullName || null,
        assignedBranch: repoAssignment?.branch || null,
        preparedRepos,
      };
    });
    return NextResponse.json({ ok: true, accounts: safe });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
