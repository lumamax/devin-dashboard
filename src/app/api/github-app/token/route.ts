import { NextRequest, NextResponse } from "next/server";
import {
  GitHubAppError,
  MissingGitHubAppConfigError,
  mintInstallationToken,
} from "@/lib/githubApp";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      installationId?: number;
      repositories?: string[];
      repositoryIds?: number[];
      permissions?: Record<string, "read" | "write">;
    };

    const token = await mintInstallationToken({
      installationId: body.installationId,
      repositories: body.repositories,
      repositoryIds: body.repositoryIds,
      permissions: body.permissions,
    });

    return NextResponse.json(
      { ok: true, token },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    const status =
      error instanceof MissingGitHubAppConfigError
        ? 400
        : error instanceof GitHubAppError
          ? 502
          : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
