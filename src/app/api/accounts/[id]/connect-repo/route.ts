import { NextResponse } from "next/server";
import { z } from "zod";
import { buildCloudAgentPrompt } from "@/lib/bootstrapPrompt";
import { getStoredAccount, updateAccountCreds } from "@/lib/connectionStore";
import {
  buildDevinLaunchUrl,
  findExistingDebugPort,
  findFreeDebugPort,
  seedPromptViaCdp,
} from "@/lib/devinSessionSeeder";
import { startAccountSession } from "@/lib/devinControlPlane";
import { buildGitHubBootstrap } from "@/lib/githubApp";
import { DEVIN_WEB_URL, LauncherError, launchChrome } from "@/lib/launcher";

const BodySchema = z
  .object({
    owner: z.string().trim().min(1),
    repo: z.string().trim().min(1),
    branch: z.string().trim().min(1).default("main"),
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

  let parsed: z.infer<typeof BodySchema>;
  try {
    const raw = await request.json();
    const result = BodySchema.safeParse(raw);
    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: `Invalid body: ${result.error.message}` },
        { status: 400 },
      );
    }
    parsed = result.data;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const account = await getStoredAccount(id).catch(() => null);
  if (!account) {
    return NextResponse.json(
      { ok: false, error: "Account not found" },
      { status: 404 },
    );
  }
  if (!account.creds) {
    return NextResponse.json(
      { ok: false, error: "Account needs re-link before repo bootstrap" },
      { status: 409 },
    );
  }

  try {
    const bootstrap = await buildGitHubBootstrap({
      owner: parsed.owner,
      repo: parsed.repo,
      branch: parsed.branch,
    });
    const prompt = buildCloudAgentPrompt(bootstrap);

    const currentDashboard =
      account.providerSpecificData?.devinDashboard &&
      typeof account.providerSpecificData.devinDashboard === "object" &&
      !Array.isArray(account.providerSpecificData.devinDashboard)
        ? (account.providerSpecificData.devinDashboard as Record<string, unknown>)
        : {};

    const providerSpecificData = {
      ...(account.providerSpecificData || {}),
      devinDashboard: {
        ...currentDashboard,
        repoAssignment: {
          owner: parsed.owner,
          repo: parsed.repo,
          branch: parsed.branch,
          fullName: `${parsed.owner}/${parsed.repo}`,
          updatedAt: new Date().toISOString(),
        },
      },
    };

    await updateAccountCreds(id, account.creds, providerSpecificData);

    const backendSeed = await startAccountSession(id, {
      prompt,
      modelOverride: "devin-opus-4-7",
    }).catch(() => null);

    const launchContext = account.launchContext || null;
    const userDataDir =
      launchContext?.launchStrategy === "user-data-dir"
        ? launchContext.userDataDir
        : launchContext?.launchStrategy === "chrome-profile"
          ? launchContext.chromeUserDataDir
          : undefined;
    const existingDebugPort = userDataDir
      ? findExistingDebugPort(userDataDir)
      : null;
    const chromePort =
      existingDebugPort || (await findFreeDebugPort().catch(() => null));
    const launchToken = `${id}-${Date.now()}`;
    const launchUrl = backendSeed
      ? buildDevinSessionWebUrl(backendSeed.sessionId)
      : chromePort
        ? buildDevinLaunchUrl(launchToken)
        : DEVIN_WEB_URL;
    const launch = launchChrome({
      connectionId: id,
      url: launchUrl,
      remoteDebuggingPort:
        existingDebugPort || !chromePort || backendSeed ? undefined : chromePort,
      userDataDir,
      profileDirectory:
        launchContext?.launchStrategy === "chrome-profile"
          ? launchContext.chromeProfileDirectory
          : undefined,
    });

    const autoSeed = backendSeed
      ? {
          attempted: true,
          ok: true,
          reason: null,
          action: "created_session_via_api",
          pageUrl: launchUrl,
        }
      : chromePort
        ? await seedPromptViaCdp({
            chromePort,
            prompt,
            launchToken,
          })
        : {
            attempted: false,
            ok: false,
            reason: "debug_port_unavailable",
            action: null,
            pageUrl: null,
          };

    return NextResponse.json({
      ok: true,
      launched: launch,
      bootstrap,
      prompt,
      autoSeed,
      startedSession: backendSeed
        ? {
            sessionId: backendSeed.sessionId,
            username: backendSeed.username,
            modelOverride: backendSeed.modelOverride,
          }
        : null,
      assignment: {
        owner: parsed.owner,
        repo: parsed.repo,
        branch: parsed.branch,
        fullName: `${parsed.owner}/${parsed.repo}`,
      },
    });
  } catch (error) {
    if (error instanceof LauncherError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: error.code === "browser_not_found" ? 500 : 400 },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

function buildDevinSessionWebUrl(sessionId: string): string {
  const normalized = sessionId.replace(/^devin-/, "");
  return `https://app.devin.ai/sessions/${normalized}?tab=README.md`;
}
