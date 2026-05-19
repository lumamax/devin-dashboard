import { NextResponse } from "next/server";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { deleteStoredAccount, getStoredAccount } from "@/lib/connectionStore";
import { getDashboardHome } from "@/lib/dashboardStore";
import { getLaunchUserDataDir } from "@/lib/browserProfileHealth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const account = await getStoredAccount(id).catch(() => null);
  if (!account) {
    return NextResponse.json(
      { ok: false, error: `Account not found: ${id}` },
      { status: 404 },
    );
  }

  const deleted = await deleteStoredAccount(id);
  if (!deleted) {
    return NextResponse.json(
      { ok: false, error: `Account not found: ${id}` },
      { status: 404 },
    );
  }

  const profileRemoval = removeDashboardOwnedProfile(getLaunchUserDataDir(account.launchContext));

  return NextResponse.json({ ok: true, id, profileRemoval });
}

function removeDashboardOwnedProfile(userDataDir: string | null): {
  removed: boolean;
  skippedReason: string | null;
} {
  if (!userDataDir) return { removed: false, skippedReason: "no_profile" };

  const profilesRoot = path.resolve(getDashboardHome(), "profiles");
  const target = path.resolve(userDataDir);
  const relative = path.relative(profilesRoot, target);
  const insideProfilesRoot = Boolean(relative && !relative.startsWith("..") && !path.isAbsolute(relative));

  if (!insideProfilesRoot) {
    return { removed: false, skippedReason: "not_dashboard_owned" };
  }
  if (!existsSync(target)) {
    return { removed: false, skippedReason: "profile_missing" };
  }

  rmSync(target, { recursive: true, force: true });
  return { removed: true, skippedReason: null };
}
