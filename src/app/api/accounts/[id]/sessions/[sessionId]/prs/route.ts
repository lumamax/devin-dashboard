import { NextResponse } from "next/server";
import { getAccountSessionPullRequests, toRouteErrorPayload } from "@/lib/devinControlPlane";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id, sessionId } = await params;

  try {
    const pullRequests = await getAccountSessionPullRequests(id, sessionId);
    return NextResponse.json({ ok: true, pullRequests });
  } catch (error) {
    const payload = toRouteErrorPayload(error);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

