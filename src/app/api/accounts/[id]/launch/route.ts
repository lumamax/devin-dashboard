/**
 * POST /api/accounts/[id]/launch
 *
 * Spawn a Chrome window backed by the per-connection persistent profile
 * directory. The browser is detached and unref'd so the dashboard does
 * not own its lifecycle.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { mkdirSync } from "node:fs";
import path from "node:path";
import CDP from "chrome-remote-interface";
import type { Protocol } from "devtools-protocol";
import { assessBrowserProfile } from "@/lib/browserProfileHealth";
import { getStoredAccount, updateAccountCreds } from "@/lib/connectionStore";
import { getDashboardHome } from "@/lib/dashboardStore";
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
  if (!account) {
    return NextResponse.json(
      { ok: false, error: `Account not found: ${id}`, code: "account_not_found" },
      { status: 404 },
    );
  }

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

  const profileHealth = assessBrowserProfile(account);
  if (profileHealth.state === "relink-required") {
    return NextResponse.json(
      {
        ok: false,
        error: profileHealth.message,
        code: profileHealth.code,
        profileHealth,
      },
      { status: 409 },
    );
  }

  let userDataDir =
    launchContext?.launchStrategy === "user-data-dir"
      ? launchContext.userDataDir
      : launchContext?.launchStrategy === "chrome-profile"
        ? launchContext.chromeUserDataDir
        : undefined;

  let recoveredMissingProfile = false;
  let recoveryProviderSpecificData: Record<string, unknown> | null = null;
  if (
    account?.creds &&
    profileHealth.state === "recoverable" &&
    profileHealth.pathExists === false
  ) {
    userDataDir = path.join(getDashboardHome(), "profiles", id);
    mkdirSync(userDataDir, { recursive: true, mode: 0o700 });
    recoveredMissingProfile = true;

    const dashboard = readDashboardState(account.providerSpecificData);
    recoveryProviderSpecificData = {
      ...(account.providerSpecificData || {}),
      devinDashboard: {
        ...dashboard,
        launchStrategy: "user-data-dir",
        userDataDir,
        source: `${typeof dashboard.source === "string" ? dashboard.source : "captured-login"}-recovered-stable-profile`,
        profileName: typeof dashboard.profileName === "string" ? dashboard.profileName : account.name,
      },
    };
  }

  const shouldSeedCookie = Boolean(
    account.creds?.cookie &&
      (recoveredMissingProfile || profileHealth.code === "profile_exists_cookie_available"),
  );

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
    const cookieRecovery = shouldSeedCookie && remoteDebuggingPort && account?.creds?.cookie
      ? await seedCookiesIntoChrome(remoteDebuggingPort, account.creds.cookie, parsed.url || DEVIN_WEB_URL)
      : null;
    if (recoveredMissingProfile && cookieRecovery?.ok && account?.creds && recoveryProviderSpecificData) {
      await updateAccountCreds(id, account.creds, recoveryProviderSpecificData);
    }
    return NextResponse.json({
      ...result,
      remoteDebuggingPort: remoteDebuggingPort || null,
      recoveredMissingProfile,
      cookieRecovery,
      profileHealth,
    });
  } catch (err) {
    if (err instanceof LauncherError) {
      const status = err.code === "browser_not_found" ? 500 : err.code === "profile_not_found" ? 409 : 400;
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

function readDashboardState(providerSpecificData: Record<string, unknown> | null) {
  const dashboard = providerSpecificData?.devinDashboard;
  if (dashboard && typeof dashboard === "object" && !Array.isArray(dashboard)) {
    return dashboard as Record<string, unknown>;
  }
  return {};
}

async function seedCookiesIntoChrome(
  chromePort: number,
  cookieHeader: string,
  targetUrl: string,
): Promise<{ ok: boolean; count: number; error: string | null }> {
  const cookies = parseCookieHeader(cookieHeader);
  if (cookies.length === 0) return { ok: false, count: 0, error: "empty_cookie_header" };

  let client: CDP.Client | null = null;
  try {
    const target = await waitForChromeTarget(chromePort);
    if (!target.webSocketDebuggerUrl) {
      return { ok: false, count: 0, error: "target_missing_websocket" };
    }

    client = await CDP({ target: target.webSocketDebuggerUrl });
    const { Network, Page } = client;
    await Promise.allSettled([Network.enable(), Page.enable()]);
    await Page.navigate({ url: DEVIN_WEB_URL }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 800));

    let count = 0;
    for (let attempt = 0; attempt < 5 && count === 0; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      for (const cookie of cookies) {
        if (await setCookieWithFallback(Network, cookie)) count += 1;
      }
    }

    await Page.navigate({ url: targetUrl }).catch(() => undefined);
    return { ok: count > 0, count, error: count > 0 ? null : "set_cookie_failed" };
  } catch (error) {
    return { ok: false, count: 0, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await client?.close().catch(() => undefined);
  }
}

async function setCookieWithFallback(
  Network: CDP.Client["Network"],
  cookie: { name: string; value: string },
): Promise<boolean> {
  const candidates: Protocol.Network.SetCookieRequest[] = [
    {
      name: cookie.name,
      value: cookie.value,
      domain: "app.devin.ai",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "None",
    },
    {
      name: cookie.name,
      value: cookie.value,
      domain: ".devin.ai",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "None",
    },
    {
      name: cookie.name,
      value: cookie.value,
      url: "https://app.devin.ai/",
      path: "/",
      secure: true,
    },
  ];

  for (const candidate of candidates) {
    const result = await Network.setCookie(candidate).catch(() => null);
    if (result?.success) return true;
  }
  return false;
}

function parseCookieHeader(cookieHeader: string): Array<{ name: string; value: string }> {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=");
      if (index <= 0) return null;
      return {
        name: part.slice(0, index).trim(),
        value: part.slice(index + 1).trim(),
      };
    })
    .filter((cookie): cookie is { name: string; value: string } => Boolean(cookie?.name));
}

async function waitForChromeTarget(chromePort: number): Promise<{ webSocketDebuggerUrl?: string }> {
  const deadline = Date.now() + 8000;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      const targets = await CDP.List({ port: chromePort });
      const page = targets.find((target) => target.type === "page" && target.url.includes("app.devin.ai"))
        || targets.find((target) => target.type === "page");
      if (page) return page;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(lastError?.message || `Could not find Chrome target on debug port ${chromePort}`);
}
