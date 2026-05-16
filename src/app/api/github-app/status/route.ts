import { NextResponse } from "next/server";
import {
  MissingGitHubAppConfigError,
  getGitHubAppProfile,
  getGitHubAppStatus,
  listGitHubAppInstallations,
} from "@/lib/githubApp";

export async function GET() {
  const status = getGitHubAppStatus();
  if (!status.configured) {
    return NextResponse.json({ ok: true, ...status });
  }

  try {
    const [app, installations] = await Promise.all([
      getGitHubAppProfile(),
      listGitHubAppInstallations(),
    ]);
    return NextResponse.json({
      ok: true,
      ...status,
      app,
      installations,
    });
  } catch (error) {
    if (error instanceof MissingGitHubAppConfigError) {
      return NextResponse.json(
        { ok: true, ...status, error: error.message },
        { status: 200 },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, ...status, error: message },
      { status: 502 },
    );
  }
}
