/**
 * GET  /api/accounts/add/[ticket] — poll capture status.
 *      Returns 'pending' | 'captured' (with masked creds) | 'expired' | 'error'.
 *
 * POST /api/accounts/add/[ticket] — save the captured credentials to
 *      OmniRoute as a `devin-web` provider connection. Body: { name, priority? }.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  disposeCapture,
  getCaptureProfileDir,
  getCaptureStatus,
} from "@/lib/captureLogin";
import { saveAccount } from "@/lib/connectionStore";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticket: string }> },
) {
  const { ticket } = await params;
  const status = getCaptureStatus(ticket);
  if (status.status === "captured") {
    // Don't leak the full bearer to the UI before save — surface only
    // metadata + a tiny preview.
    return NextResponse.json({
      ok: true,
      status: "captured",
      orgId: status.orgId,
      suggestedName: status.suggestedName,
      bearerPreview: status.bearer.slice(0, 16) + "…",
      hasCookie: Boolean(status.cookie),
      capturedAt: status.capturedAt,
    });
  }
  return NextResponse.json({ ok: true, ...status });
}

const SaveSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    priority: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticket: string }> },
) {
  const { ticket } = await params;
  let parsed: z.infer<typeof SaveSchema>;
  try {
    const raw = await request.json();
    const result = SaveSchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: `Invalid body: ${result.error.message}` },
        { status: 400 },
      );
    }
    parsed = result.data;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const status = getCaptureStatus(ticket);
  if (status.status !== "captured") {
    return NextResponse.json(
      { ok: false, error: `Cannot save ticket in status '${status.status}'` },
      { status: 409 },
    );
  }

  try {
    const captureProfileDir = getCaptureProfileDir(ticket);
    const { id } = await saveAccount({
      name: parsed.name,
      creds: {
        cookie: status.cookie,
        bearer: status.bearer,
        orgId: status.orgId,
      },
      priority: parsed.priority,
      providerSpecificData: captureProfileDir
        ? {
            devinDashboard: {
              launchStrategy: "user-data-dir",
              userDataDir: captureProfileDir,
              source: "captured-login",
              profileName: parsed.name,
            },
          }
        : undefined,
    });
    disposeCapture(ticket);
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
