/**
 * GET /api/accounts — list stored Devin accounts (from OmniRoute).
 *
 * Returns the rows from `provider_connections` where `provider=devin-web`,
 * with the captured credentials parsed out of the apiKey JSON blob.
 * Credentials themselves are never sent back to the browser — we only
 * expose flags like `hasCreds`, `orgId`, and `bearerPreview` for UI
 * display.
 */

import { NextResponse } from "next/server";
import { listStoredAccounts } from "@/lib/connectionStore";

export async function GET() {
  try {
    const accounts = await listStoredAccounts();
    const safe = accounts.map((a) => {
      const repoAssignment = readRepoAssignment(a.providerSpecificData);

      return {
        id: a.id,
        name: a.name,
        priority: a.priority,
        testStatus: a.testStatus,
        rateLimitedUntil: a.rateLimitedUntil,
        lastError: a.lastError,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        hasCreds: a.creds !== null,
        orgId: a.creds?.orgId || null,
        bearerPreview: a.creds?.bearer ? `${a.creds.bearer.slice(0, 16)}…` : null,
        assignedRepoFullName: repoAssignment?.fullName || null,
        assignedBranch: repoAssignment?.branch || null,
      };
    });
    return NextResponse.json({ ok: true, accounts: safe });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
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

  if (!fullName) {
    return null;
  }

  return {
    fullName,
    branch,
  };
}
