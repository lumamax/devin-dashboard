/**
 * POST /api/accounts/extract-cookie
 *
 * Auto-extract `wos-session` from the user's logged-in Chrome profile.
 * The cookie value is returned to the dashboard UI so the user can paste
 * it into an OmniRoute connection (or upcoming auto-save flow).
 *
 * Security:
 *   - This endpoint **must only run on localhost**. Reading the user's
 *     Chrome cookie store from a remote host would be a serious privilege
 *     escalation. Enforced by the dashboard's deliberately localhost-only
 *     dev/start scripts.
 *   - The cookie is never logged or persisted by this endpoint — it goes
 *     straight back to the calling browser tab on the same machine.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { CookieExtractError, extractWosSession } from "@/lib/extractCookies";

const BodySchema = z
  .object({
    sourceProfile: z.string().trim().min(1).optional(),
    cookieName: z.string().trim().min(1).optional(),
  })
  .strict();

export async function POST(request: Request) {
  let parsed: z.infer<typeof BodySchema> = {};
  try {
    const text = await request.text();
    if (text) {
      const raw = JSON.parse(text);
      const result = BodySchema.safeParse(raw);
      if (!result.success) {
        return NextResponse.json(
          { ok: false, error: `Invalid body: ${result.error.message}` },
          { status: 400 }
        );
      }
      parsed = result.data;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await extractWosSession({
      sourceProfile: parsed.sourceProfile,
      cookieName: parsed.cookieName,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof CookieExtractError) {
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code, hint: err.hint },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: `Auto-extract failed: ${message}` },
      { status: 500 }
    );
  }
}
