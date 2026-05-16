import { NextRequest, NextResponse } from "next/server";
import {
  GitHubAppError,
  MissingGitHubAppConfigError,
  buildGitHubBootstrap,
} from "@/lib/githubApp";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      installationId?: number;
      owner?: string;
      repo?: string;
      branch?: string;
      permissions?: Record<string, "read" | "write">;
    };

    const owner = body.owner?.trim();
    const repo = body.repo?.trim();
    if (!owner || !repo) {
      return NextResponse.json(
        { ok: false, error: "owner and repo are required" },
        { status: 400 },
      );
    }

    const bootstrap = await buildGitHubBootstrap({
      installationId: body.installationId,
      owner,
      repo,
      branch: body.branch || "main",
      permissions: body.permissions,
    });

    return NextResponse.json(
      { ok: true, bootstrap },
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
