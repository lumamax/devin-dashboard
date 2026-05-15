/**
 * POST /api/accounts/add — start the "log in via Chrome" capture flow.
 *
 * Spawns a fresh Chrome window with an empty profile and a remote
 * debugging port, then asynchronously listens for the first
 * Authorization-bearer-carrying request to app.devin.ai/api/*. Returns
 * a ticket the dashboard polls via GET /api/accounts/add/[ticket].
 */

import { NextResponse } from "next/server";
import { startCapture } from "@/lib/captureLogin";

export async function POST() {
  try {
    const { ticket, chromePort } = await startCapture();
    return NextResponse.json({ ok: true, ticket, chromePort });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
