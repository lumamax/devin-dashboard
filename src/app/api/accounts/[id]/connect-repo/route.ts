import { NextResponse } from "next/server";
import { z } from "zod";
import { buildRepoAttachPrompt } from "@/lib/bootstrapPrompt";
import { getStoredAccount, updateAccountCreds } from "@/lib/connectionStore";
import { listAccountSessions, startAccountSession } from "@/lib/devinControlPlane";
import { DevinApiError } from "@/lib/devinApi";
import {
  buildRepoAssignment,
  findPreparedRepo,
  mergePreparedRepoState,
  type PreparedRepoRecord,
} from "@/lib/dashboardRepoState";
import { buildGitHubBootstrap } from "@/lib/githubApp";
import { decideRepoAttachSession } from "@/lib/sessionPolicy";

const BodySchema = z
  .object({
    owner: z.string().trim().min(1),
    repo: z.string().trim().min(1),
    branch: z.string().trim().min(1).default("main"),
    modelOverride: z.string().trim().min(1).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing connection id" }, { status: 400 });
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
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const account = await getStoredAccount(id).catch(() => null);
  if (!account) {
    return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });
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
    const repoAssignment = buildRepoAssignment(parsed.owner, parsed.repo, parsed.branch);
    const prompt = buildRepoAttachPrompt(bootstrap);
    const existingPrepared = findPreparedRepo(account.providerSpecificData, repoAssignment.fullName);
    const recentSessions = await listAccountSessions(id, { limit: 12, mineOnly: true }).catch(() => null);
    const decision = decideRepoAttachSession({
      targetRepoFullName: repoAssignment.fullName,
      sessions: recentSessions?.sessions || [],
      lastPreparedSessionId: existingPrepared?.sessionId || null,
    });

    if (existingPrepared) {
      const preparedRecord = normalizePreparedRepo(existingPrepared, repoAssignment.branch, decision.action === "reuse" ? decision.session.devinId : existingPrepared.sessionId);
      await updateAccountCreds(
        id,
        account.creds,
        mergePreparedRepoState(account.providerSpecificData, repoAssignment, preparedRecord),
      );

      return NextResponse.json({
        ok: true,
        sessionAction: decision.action === "reuse" ? "reused" : "already-prepared",
        startedSession: preparedRecord.sessionId
          ? {
              sessionId: preparedRecord.sessionId,
              username: null,
              modelOverride: null,
            }
          : null,
        preparedRepo: toPreparedRepoPayload(preparedRecord),
        assignment: repoAssignment,
      });
    }

    if (decision.action === "blocked") {
      const label = decision.session.title?.trim() || shrinkId(decision.session.devinId, 6);
      return NextResponse.json(
        {
          ok: false,
          error: `У этого аккаунта уже есть живая Devin-сессия: ${label}. Сначала закончи её, потом прошивай новый repo.`,
          code: "live_session_exists",
        },
        { status: 409 },
      );
    }

    if (decision.action === "reuse") {
      const preparedRecord = normalizePreparedRepo(
        {
          repoFullName: repoAssignment.fullName,
          branch: repoAssignment.branch,
          sessionId: decision.session.devinId,
          mode: "attach-only",
          updatedAt: new Date().toISOString(),
        },
        repoAssignment.branch,
        decision.session.devinId,
      );

      await updateAccountCreds(
        id,
        account.creds,
        mergePreparedRepoState(account.providerSpecificData, repoAssignment, preparedRecord),
      );

      return NextResponse.json({
        ok: true,
        sessionAction: "reused",
        startedSession: {
          sessionId: decision.session.devinId,
          username: null,
          modelOverride: null,
        },
        preparedRepo: toPreparedRepoPayload(preparedRecord),
        assignment: repoAssignment,
      });
    }

    let backendSeed;
    try {
      backendSeed = await startAccountSession(id, {
        prompt,
        modelOverride: parsed.modelOverride || "devin-opus-4-7",
      });
    } catch (error) {
      const backendStartError = {
        message: error instanceof Error ? error.message : String(error),
        status: error instanceof DevinApiError ? error.status : null,
        detail: error instanceof DevinApiError ? error.bodyText : null,
      };

      return NextResponse.json(
        {
          ok: false,
          error: describeBackendStartError(backendStartError),
          code: inferBackendErrorCode(backendStartError),
          backendStartError,
          assignment: repoAssignment,
        },
        { status: backendStartError.status === 403 ? 409 : 502 },
      );
    }

    const preparedRecord = normalizePreparedRepo(
      {
        repoFullName: repoAssignment.fullName,
        branch: repoAssignment.branch,
        sessionId: backendSeed.sessionId,
        mode: "attach-only",
        updatedAt: new Date().toISOString(),
      },
      repoAssignment.branch,
      backendSeed.sessionId,
    );

    await updateAccountCreds(
      id,
      account.creds,
      mergePreparedRepoState(account.providerSpecificData, repoAssignment, preparedRecord),
    );

    return NextResponse.json({
      ok: true,
      sessionAction: "created",
      startedSession: {
        sessionId: backendSeed.sessionId,
        username: backendSeed.username,
        modelOverride: backendSeed.modelOverride,
      },
      preparedRepo: toPreparedRepoPayload(preparedRecord),
      assignment: repoAssignment,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function normalizePreparedRepo(
  record: PreparedRepoRecord,
  branch: string,
  sessionId: string | null,
): PreparedRepoRecord {
  return {
    repoFullName: record.repoFullName,
    branch: record.branch || branch,
    sessionId,
    mode: "attach-only",
    updatedAt: record.updatedAt || new Date().toISOString(),
  };
}

function toPreparedRepoPayload(record: PreparedRepoRecord) {
  return {
    fullName: record.repoFullName,
    branch: record.branch,
    sessionId: record.sessionId,
    updatedAt: record.updatedAt,
  };
}

function describeBackendStartError(error: { status: number | null; detail: string | null; message: string | null }) {
  const detail = String(error.detail || "").toLowerCase();
  if (detail.includes("out_of_quota")) {
    return "У этого аккаунта закончилась квота, новую Devin-сессию сейчас не создать.";
  }
  if (detail.includes("billing error")) {
    return "У этого аккаунта billing-блокировка, поэтому backend Devin не дал создать новую сессию.";
  }
  if (detail.includes("no seat allocated")) {
    return "У аккаунта сейчас нет свободного seat для новой Devin-сессии.";
  }
  if (error.status === 403) {
    return "Backend Devin отклонил запуск новой сессии.";
  }
  return error.message || "Не удалось создать Devin-сессию.";
}

function inferBackendErrorCode(error: { detail: string | null; status: number | null }) {
  const detail = String(error.detail || "").toLowerCase();
  if (detail.includes("out_of_quota")) return "out_of_quota";
  if (detail.includes("billing error")) return "billing_error";
  if (detail.includes("no seat allocated")) return "no_seat_allocated";
  if (error.status === 403) return "backend_forbidden";
  return "backend_start_failed";
}

function shrinkId(value: string, size: number): string {
  if (value.length <= size * 2 + 1) return value;
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}
