import { NextRequest, NextResponse } from "next/server";
import { listStoredAccounts } from "@/lib/connectionStore";
import { rankStoredAccounts } from "@/lib/accountOrdering";

export async function GET(request: NextRequest) {
  const targetRepo = request.nextUrl.searchParams.get("targetRepo") || null;

  try {
    const accounts = await listStoredAccounts();
    const ranked = await rankStoredAccounts(accounts, targetRepo);
    const best = ranked.find((row) => !row.disqualified) || null;

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
