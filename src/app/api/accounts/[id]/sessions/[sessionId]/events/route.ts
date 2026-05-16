import { NextResponse } from "next/server";
import { getAccountSessionEvents, toRouteErrorPayload } from "@/lib/devinControlPlane";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id, sessionId } = await params;
  const url = new URL(request.url);
  const take = readInteger(url.searchParams.get("take"), 60);
  const order = readOrder(url.searchParams.get("order"));

  try {
    const events = await getAccountSessionEvents(id, sessionId, { take, order });
    return NextResponse.json({ ok: true, events });
  } catch (error) {
    const payload = toRouteErrorPayload(error);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

function readInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOrder(value: string | null): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

