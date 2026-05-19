import { NextResponse } from "next/server";
import {
  disposeCapture,
  getCaptureProfileDir,
  getCaptureStatus,
} from "@/lib/captureLogin";
import { getStoredAccount, updateAccountCreds } from "@/lib/connectionStore";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; ticket: string }> },
) {
  const { id, ticket } = await params;
  const account = await getStoredAccount(id).catch(() => null);
  if (!account?.creds) {
    return NextResponse.json(
      { ok: false, error: `Account not found or has no credentials: ${id}` },
      { status: 404 },
    );
  }

  const status = getCaptureStatus(ticket);
  if (status.status !== "captured") {
    return NextResponse.json(
      { ok: false, error: `Cannot relink ticket in status '${status.status}'`, status: status.status },
      { status: 409 },
    );
  }

  const captureProfileDir = getCaptureProfileDir(ticket);
  if (!captureProfileDir) {
    return NextResponse.json(
      { ok: false, error: "Capture profile directory is missing" },
      { status: 409 },
    );
  }

  const dashboard = readDashboardState(account.providerSpecificData);
  const nextName = status.suggestedName || account.name;
  await updateAccountCreds(
    id,
    {
      cookie: status.cookie,
      bearer: status.bearer,
      orgId: status.orgId,
    },
    {
      ...(account.providerSpecificData || {}),
      devinDashboard: {
        ...dashboard,
        launchStrategy: "user-data-dir",
        userDataDir: captureProfileDir,
        source: "captured-login-relink",
        profileName: nextName,
      },
    },
    { name: nextName },
  );

  disposeCapture(ticket);
  return NextResponse.json({ ok: true, id, name: nextName, profileDir: captureProfileDir });
}

function readDashboardState(providerSpecificData: Record<string, unknown> | null) {
  const dashboard = providerSpecificData?.devinDashboard;
  if (dashboard && typeof dashboard === "object" && !Array.isArray(dashboard)) {
    return dashboard as Record<string, unknown>;
  }
  return {};
}
