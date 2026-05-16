/**
 * Public-facing types shared between server-rendered pages and client
 * components. The actual data fetching lives in `connectionStore.ts`
 * (server only, requires OmniRoute creds) and is exposed to the client
 * via `/api/accounts`.
 */

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
  bearerPreview: string | null;
  assignedRepoFullName?: string | null;
  assignedBranch?: string | null;
};

/**
 * @deprecated kept for the v0.1 page.tsx import path. Use AccountSummary going forward.
 */
export type DevinAccount = AccountSummary & {
  provider?: string;
  alias?: string | null;
  hasCookie?: boolean | undefined;
};

export async function listDevinAccounts(): Promise<AccountSummary[]> {
  // Server-only fetch using internal Next.js routing. We hit our own
  // /api/accounts so all the OmniRoute-token wrangling stays in one
  // place (connectionStore.ts).
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
