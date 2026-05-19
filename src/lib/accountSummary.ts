export type PreparedRepoSummary = {
  fullName: string;
  branch: string | null;
  sessionId: string | null;
  updatedAt: string | null;
};

export type AccountSummary = {
  id: string;
  name: string;
  priority: number | null;
  testStatus: string | null;
  rateLimitedUntil: string | null;
  lastError: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  hasCreds: boolean;
  orgId: string | null;
  assignedRepoFullName?: string | null;
  assignedBranch?: string | null;
  preparedRepos?: PreparedRepoSummary[];
  browserProfileState?: "ready" | "recoverable" | "relink-required" | "unknown";
  browserProfileCode?: string | null;
  browserProfileMessage?: string | null;
  browserProfilePathExists?: boolean | null;
  hasStoredBrowserCookie?: boolean;
  hasProfileBrowserCookie?: boolean;
};

export async function listDevinAccounts(): Promise<AccountSummary[]> {
  const url = `${process.env.DEVIN_DASHBOARD_INTERNAL_URL || "http://127.0.0.1:29128"}/api/accounts`;
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) {
    const body = res ? await res.text().catch(() => "") : "no response";
    throw new Error(`GET /api/accounts failed: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { accounts?: AccountSummary[]; error?: string; ok?: boolean };
  if (json.ok === false) throw new Error(json.error || "Unknown error");
  return json.accounts || [];
}
