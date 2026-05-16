import { NextResponse } from "next/server";
import { getAccountSession, toRouteErrorPayload } from "@/lib/devinControlPlane";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id, sessionId } = await params;

  try {
    const session = await getAccountSession(id, sessionId);
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    const payload = toRouteErrorPayload(error);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

