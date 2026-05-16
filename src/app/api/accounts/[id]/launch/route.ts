/**
 * POST /api/accounts/[id]/launch
 *
 * Spawn a Chrome window backed by the per-connection persistent profile
 * directory. The browser is detached and unref'd so the dashboard does
 * not own its lifecycle.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getStoredAccount } from "@/lib/connectionStore";
import { findExistingDebugPort, findFreeDebugPort } from "@/lib/devinSessionSeeder";
import { DEVIN_WEB_URL, LauncherError, launchChrome } from "@/lib/launcher";

const BodySchema = z
  .object({
    url: z.string().trim().min(1).optional(),
    binaryPath: z.string().trim().min(1).optional(),
    profileRoot: z.string().trim().min(1).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Missing connection id" },
      { status: 400 },
    );
  }

  const account = await getStoredAccount(id).catch(() => null);
  const launchContext = account?.launchContext || null;

  let parsed: z.infer<typeof BodySchema> = {};
  try {
    const text = await request.text();
    if (text) {
      const raw = JSON.parse(text);
      const result = BodySchema.safeParse(raw);
      if (!result.success) {
        return NextResponse.json(
          { ok: false, error: `Invalid body: ${result.error.message}` },
          { status: 400 },
        );
      }
      parsed = result.data;
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const userDataDir =
    launchContext?.launchStrategy === "user-data-dir"
      ? launchContext.userDataDir
      : launchContext?.launchStrategy === "chrome-profile"
        ? launchContext.chromeUserDataDir
        : undefined;
  const existingDebugPort = userDataDir ? findExistingDebugPort(userDataDir) : null;
  const remoteDebuggingPort = existingDebugPort || (userDataDir
    ? await findFreeDebugPort().catch(() => null)
    : null);

  try {
    const result = launchChrome({
      connectionId: id,
      url: parsed.url || DEVIN_WEB_URL,
      binaryPath: parsed.binaryPath,
      profileRoot: parsed.profileRoot,
      userDataDir,
      profileDirectory:
        launchContext?.launchStrategy === "chrome-profile"
          ? launchContext.chromeProfileDirectory
          : undefined,
      remoteDebuggingPort: remoteDebuggingPort || undefined,
    });
    return NextResponse.json({
      ...result,
      remoteDebuggingPort: remoteDebuggingPort || null,
    });
  } catch (err) {
    if (err instanceof LauncherError) {
      const status = err.code === "browser_not_found" ? 500 : 400;
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code },
        { status },
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: `Failed to launch Chrome: ${message}` },
      { status: 500 },
    );
  }
}
