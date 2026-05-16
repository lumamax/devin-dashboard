import { NextResponse } from "next/server";
import { listAccountSessions, toRouteErrorPayload } from "@/lib/devinControlPlane";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(request.url);
  const limit = readInteger(url.searchParams.get("limit"), 30);
  const mineOnly = readBoolean(url.searchParams.get("mine"), true);
  const includeArchived = readBoolean(url.searchParams.get("archived"), false);
  const updatedDateFrom = url.searchParams.get("updated_date_from");

  try {
    const result = await listAccountSessions(id, {
      limit,
      mineOnly,
      includeArchived,
      updatedDateFrom,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const payload = toRouteErrorPayload(error);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}

function readInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(value: string | null, fallback: boolean) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

