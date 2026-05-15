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
    const safe = accounts.map((a) => ({
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
    }));
    return NextResponse.json({ ok: true, accounts: safe });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
