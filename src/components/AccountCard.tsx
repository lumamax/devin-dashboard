"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ACTIVE_REPO_EVENT,
  ACTIVE_REPO_MODEL_EVENT,
  DEFAULT_ACTIVE_REPO_MODEL,
  formatActiveRepoLabel,
  getActiveRepoModel,
  getActiveRepoSelections,
  type ActiveRepoModel,
  type ActiveRepoSelection,
} from "@/lib/activeRepo";
import type { AccountSummary, PreparedRepoSummary } from "@/lib/accountSummary";

type Status = "idle" | "launching" | "connecting" | "success" | "warning" | "error";

type ModelSummary = {
  id: string;
  label: string;
};

type QuotaResponse = {
  ok: boolean;
  error?: string;
  code?: string;
  usage?: unknown;
  status?: unknown;
  models?: unknown;
};

type ConnectRepoResponse = {
  ok: boolean;
  error?: string;
  code?: string;
  assignment?: {
    owner?: string;
    repo?: string;
    branch?: string;
    fullName?: string;
  };
  preparedRepo?: {
    fullName?: string;
    branch?: string | null;
    sessionId?: string | null;
    updatedAt?: string | null;
  } | null;
  startedSession?: {
    sessionId?: string | null;
    username?: string | null;
    modelOverride?: string | null;
  } | null;
  backendStartError?: {
    message?: string | null;
    status?: number | null;
    detail?: string | null;
  } | null;
  sessionAction?: "created" | "reused" | "already-prepared" | null;
};

type SessionLatestStatus = {
  enum: string | null;
  message: string | null;
  timestamp: string | null;
  userActionRequired: boolean | null;
};

type SessionSummary = {
  devinId: string;
  title: string | null;
  status: string | null;
  activityStatus: string | null;
  currentActivity: string | null;
  maxAcuLimit: number | null;
  sessionOrigin: string | null;
  isArchived: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  tags: string[];
  latestStatus: SessionLatestStatus | null;
};

type SessionListResponse = {
  ok: boolean;
  error?: string;
  sessions?: SessionSummary[];
  currentUserId?: string | null;
};

type SessionPullRequest = {
  id: string | null;
  number: number | null;
  title: string | null;
  url: string | null;
  state: string | null;
};

type SessionDetailResponse = {
  ok: boolean;
  error?: string;
  session?: SessionSummary;
};

type SessionEventsSummary = {
  totalItems: number;
  counts: Record<string, number>;
  latestStatus: EventExcerpt | null;
  latestDevinMessage: EventExcerpt | null;
  latestUserMessage: EventExcerpt | null;
  latestThought: EventExcerpt | null;
  latestTodoUpdate: EventExcerpt | null;
  latestCommands: EventExcerpt[];
  items: EventExcerpt[];
};

type EventExcerpt = {
  type: string;
  timestamp: string | null;
  createdAtMs: number | null;
  eventId: string | null;
  message: string | null;
  summary: string | null;
  status: string | null;
  command: string | null;
  query: string | null;
  completedCount: number | null;
  pendingCount: number | null;
  inProgressCount: number | null;
};

type SessionEventsResponse = {
  ok: boolean;
  error?: string;
  events?: SessionEventsSummary;
};

type SessionPullRequestsResponse = {
  ok: boolean;
  error?: string;
  pullRequests?: SessionPullRequest[];
};

type QuotaState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "needs-relink" }
  | { kind: "error"; error: string; code?: string }
  | { kind: "ready"; usage: unknown; status: unknown; models: unknown };

type SessionListState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; error: string }
  | { kind: "ready"; sessions: SessionSummary[] };

type SessionFocusState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      session: SessionSummary;
      events: SessionEventsSummary;
      pullRequests: SessionPullRequest[];
    }
  | { kind: "error"; error: string };

type QuotaSummary = {
  planName: string | null;
  models: ModelSummary[];
  dailyPercentage: number | null;
  weeklyPercentage: number | null;
  dailyDetail: string;
  weeklyDetail: string;
};

type BootstrapAssistState =
  | { kind: "idle" }
  | {
      kind: "ready";
      repoLabel: string;
      branch: string;
      sessionAction: "created" | "reused" | "already-prepared";
      sessionId: string | null;
    };

export function AccountCard({ account }: { account: AccountSummary }) {
  const [status, setStatus] = useState<Status>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaState>({ kind: "idle" });
  const [selectedRepos, setSelectedRepos] = useState<ActiveRepoSelection[]>([]);
  const [selectedModel, setSelectedModel] = useState<ActiveRepoModel>(DEFAULT_ACTIVE_REPO_MODEL);
  const [assignedRepoFullName, setAssignedRepoFullName] = useState(account.assignedRepoFullName || null);
  const [assignedBranch, setAssignedBranch] = useState(account.assignedBranch || null);
  const [preparedRepos, setPreparedRepos] = useState<PreparedRepoSummary[]>(account.preparedRepos || []);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionsState, setSessionsState] = useState<SessionListState>({ kind: "idle" });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionFocus, setSessionFocus] = useState<Record<string, SessionFocusState>>({});
  const [bootstrapAssist, setBootstrapAssist] = useState<BootstrapAssistState>({ kind: "idle" });

  useEffect(() => {
    setAssignedRepoFullName(account.assignedRepoFullName || null);
    setAssignedBranch(account.assignedBranch || null);
    setPreparedRepos(account.preparedRepos || []);
  }, [account.assignedBranch, account.assignedRepoFullName, account.preparedRepos]);

  useEffect(() => {
    setSessionsOpen(false);
    setSessionsState({ kind: "idle" });
    setSelectedSessionId(null);
    setSessionFocus({});
    setBootstrapAssist({ kind: "idle" });
  }, [account.id]);

  useEffect(() => {
    const syncActiveState = () => {
      setSelectedRepos(getActiveRepoSelections());
      setSelectedModel(getActiveRepoModel());
    };

    const handleActiveRepo = (event: Event) => {
      const detail = (event as CustomEvent<ActiveRepoSelection[]>).detail;
      if (Array.isArray(detail)) {
        setSelectedRepos(detail);
        return;
      }
      syncActiveState();
    };

    const handleActiveModel = (event: Event) => {
      const detail = (event as CustomEvent<ActiveRepoModel>).detail;
      if (detail && typeof detail === "object") {
        setSelectedModel(detail);
        return;
      }
      syncActiveState();
    };

    syncActiveState();
    window.addEventListener(ACTIVE_REPO_EVENT, handleActiveRepo as EventListener);
    window.addEventListener(ACTIVE_REPO_MODEL_EVENT, handleActiveModel as EventListener);
    window.addEventListener("storage", syncActiveState);

    return () => {
      window.removeEventListener(ACTIVE_REPO_EVENT, handleActiveRepo as EventListener);
      window.removeEventListener(ACTIVE_REPO_MODEL_EVENT, handleActiveModel as EventListener);
      window.removeEventListener("storage", syncActiveState);
    };
  }, []);

  useEffect(() => {
    if (!account.hasCreds) {
      setQuota({ kind: "needs-relink" });
      return;
    }

    let cancelled = false;
    setQuota({ kind: "loading" });

    fetch(`/api/accounts/${account.id}/quota`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as QuotaResponse;
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setQuota({
            kind: "error",
            error: json.error || `HTTP ${res.status}`,
            code: json.code,
          });
          return;
        }
        setQuota({
          kind: "ready",
          usage: json.usage,
          status: json.status,
          models: json.models ?? [],
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setQuota({
          kind: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [account.id, account.hasCreds]);

  async function handleLaunch(options?: { url?: string; successMessage?: string }) {
    setStatus("launching");
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options?.url ? { url: options.url } : {}),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setStatus("success");
      setStatusMessage(options?.successMessage || `Chrome открыт (pid ${json.pid})`);
    } catch (err: unknown) {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "Unknown error");
    }
  }

  async function handleStart() {
    const preferredPrepared = findPreferredPreparedSession(preparedRepos, selectedRepos);
    const preferredUrl = bootstrapAssist.kind === "ready" && bootstrapAssist.sessionId
      ? buildSessionWebUrl(bootstrapAssist.sessionId)
      : preferredPrepared?.sessionId
        ? buildSessionWebUrl(preferredPrepared.sessionId)
        : null;

    await handleLaunch({
      url: preferredUrl || undefined,
      successMessage:
        preferredPrepared?.sessionId || bootstrapAssist.kind === "ready"
          ? "Открыл подготовленную Devin-сессию."
          : "Открыл аккаунт в Devin.",
    });
  }

  async function handleOpenSession(session: SessionSummary) {
    setStatus("launching");
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: buildSessionWebUrl(session.devinId) }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setStatus("success");
      setStatusMessage(`Открыл сессию ${session.title || shrinkId(session.devinId, 6)} в Chrome.`);
    } catch (err: unknown) {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "Unknown error");
    }
  }

  async function loadSessions(force = false) {
    if (!account.hasCreds) return;
    if (!force && sessionsState.kind === "ready") return;

    setSessionsState({ kind: "loading" });
    try {
      const res = await fetch(`/api/accounts/${account.id}/sessions?limit=4&mine=true`, {
        cache: "no-store",
      });
      const json = (await res.json()) as SessionListResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const sessions = json.sessions || [];
      setSessionsState({ kind: "ready", sessions });

      const nextSelected =
        (selectedSessionId && sessions.find((session) => session.devinId === selectedSessionId)?.devinId) ||
        sessions[0]?.devinId ||
        null;

      setSelectedSessionId(nextSelected);
      if (nextSelected) {
        void loadSessionFocus(nextSelected, force);
      }
    } catch (err: unknown) {
      setSessionsState({
        kind: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function loadSessionFocus(sessionId: string, force = false) {
    if (!force) {
      const current = sessionFocus[sessionId];
      if (current && (current.kind === "ready" || current.kind === "loading")) {
        return;
      }
    }

    setSessionFocus((current) => ({
      ...current,
      [sessionId]: { kind: "loading" },
    }));

    try {
      const [detailRes, eventsRes, prsRes] = await Promise.all([
        fetch(`/api/accounts/${account.id}/sessions/${sessionId}`, { cache: "no-store" }),
        fetch(`/api/accounts/${account.id}/sessions/${sessionId}/events?take=28&order=desc`, {
          cache: "no-store",
        }),
        fetch(`/api/accounts/${account.id}/sessions/${sessionId}/prs`, { cache: "no-store" }),
      ]);

      const detailJson = (await detailRes.json()) as SessionDetailResponse;
      const eventsJson = (await eventsRes.json()) as SessionEventsResponse;
      const prsJson = (await prsRes.json()) as SessionPullRequestsResponse;

      if (!detailRes.ok || !detailJson.ok || !detailJson.session) {
        throw new Error(detailJson.error || `HTTP ${detailRes.status}`);
      }
      if (!eventsRes.ok || !eventsJson.ok || !eventsJson.events) {
        throw new Error(eventsJson.error || `HTTP ${eventsRes.status}`);
      }
      if (!prsRes.ok || !prsJson.ok) {
        throw new Error(prsJson.error || `HTTP ${prsRes.status}`);
      }

      const resolvedSession = detailJson.session!;
      const resolvedEvents = eventsJson.events!;

      setSessionFocus((current) => ({
        ...current,
        [sessionId]: {
          kind: "ready",
          session: resolvedSession,
          events: resolvedEvents,
          pullRequests: prsJson.pullRequests || [],
        },
      }));
    } catch (err: unknown) {
      setSessionFocus((current) => ({
        ...current,
        [sessionId]: {
          kind: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        },
      }));
    }
  }

  async function toggleSessions() {
    const nextOpen = !sessionsOpen;
    setSessionsOpen(nextOpen);
    if (nextOpen) {
      await loadSessions();
    }
  }

  async function handleSelectSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    await loadSessionFocus(sessionId);
  }

  async function handleConnectRepo() {
    if (!account.hasCreds) {
      setStatus("error");
      setStatusMessage("Сначала перелинкуй этот аккаунт, потом уже привязывай рабочее репо.");
      return;
    }

    const nextRepo = nextPendingRepo;
    if (!nextRepo) {
      setStatus("warning");
      setStatusMessage(
        selectedRepos.length === 0
          ? "Сначала выбери хотя бы один repo в верхнем блоке."
          : "Для этого аккаунта все выбранные repo уже прошиты.",
      );
      return;
    }

    setStatus("connecting");
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/accounts/${account.id}/connect-repo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...nextRepo,
          modelOverride: selectedModel.id,
        }),
      });
      const json = (await res.json()) as ConnectRepoResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || describeBackendStartError(json.backendStartError || null) || `HTTP ${res.status}`);
      }

      const fullName = json.assignment?.fullName || formatActiveRepoLabel(nextRepo);
      const nextBranch = json.assignment?.branch || nextRepo.branch;
      const preparedRepo = {
        fullName: json.preparedRepo?.fullName || fullName,
        branch: json.preparedRepo?.branch || nextBranch,
        sessionId: json.preparedRepo?.sessionId || json.startedSession?.sessionId || null,
        updatedAt: json.preparedRepo?.updatedAt || new Date().toISOString(),
      };
      const sessionAction =
        json.sessionAction === "reused"
          ? "reused"
          : json.sessionAction === "already-prepared"
            ? "already-prepared"
            : "created";

      setAssignedRepoFullName(fullName);
      setAssignedBranch(nextBranch);
      setPreparedRepos((current) => upsertPreparedRepo(current, preparedRepo));
      setBootstrapAssist({
        kind: "ready",
        repoLabel: fullName,
        branch: nextBranch,
        sessionAction,
        sessionId: json.startedSession?.sessionId || preparedRepo.sessionId || null,
      });
      setStatus("success");
      setStatusMessage(buildAttachStatusMessage(sessionAction, fullName));

    } catch (err: unknown) {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "Unknown error");
    }
  }

  const displayName = account.name?.trim() || account.id || "Unnamed Devin account";
  const helperText = account.lastError
    ? account.lastError
    : !account.hasCreds
      ? "Нужно заново перелинковать аккаунт."
      : null;
  const quotaSummary =
    quota.kind === "ready" ? buildQuotaSummary(quota.usage, quota.status, quota.models) : null;
  const pendingRepos = getPendingRepos(selectedRepos, preparedRepos);
  const nextPendingRepo = pendingRepos[0] || null;
  const canSeedRepo = account.hasCreds && pendingRepos.length > 0;
  const isConnectButtonActive = canSeedRepo && status !== "launching" && status !== "connecting";
  const preparedRepoLabels = preparedRepos.map((repo) => repo.fullName).filter(Boolean);
  const planLabel = quotaSummary?.planName ? humanize(quotaSummary.planName) : null;
  const actionHint = bootstrapAssist.kind === "ready"
    ? bootstrapAssist.sessionId
      ? `${bootstrapAssist.repoLabel} · ${shrinkId(bootstrapAssist.sessionId, 6)}`
      : `${bootstrapAssist.repoLabel} готов`
    : nextPendingRepo
      ? `${formatActiveRepoLabel(nextPendingRepo)} · ${selectedModel.label}`
      : selectedRepos.length > 0
        ? "Все выбранные repo уже готовы"
        : "Сначала выбери repo";

  return (
    <article className="rounded-[20px] border border-[#1f2835] bg-[linear-gradient(180deg,rgba(15,19,27,0.96),rgba(9,12,18,0.98))] p-3.5 shadow-[0_16px_34px_rgba(0,0,0,0.24)] transition hover:border-[#2b3646]">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_248px] xl:items-start">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-[15px] font-semibold text-white sm:text-base">{displayName}</h3>
                <StatusBadge testStatus={account.testStatus} rateLimitedUntil={account.rateLimitedUntil} />
                {!account.hasCreds ? <InlineBadge tone="warn">перелинк</InlineBadge> : null}
                {account.lastError ? <InlineBadge tone="danger">ошибка</InlineBadge> : null}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-[#9fb0c5]">
                {account.updatedAt ? <MetaPill label="updated" value={formatDate(account.updatedAt)} /> : null}
                {planLabel ? <MetaPill label="plan" value={planLabel} /> : null}
              </div>
            </div>
          </div>

          <div className="rounded-[16px] border border-[#1f2835] bg-[#111722] px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#73839b]">
                  Подцеплено
                </div>
                {preparedRepoLabels.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {preparedRepoLabels.map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-[#293444] bg-[#18202c] px-2.5 py-1 text-[11px] text-[#dbe6f2]"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-[12px] leading-5 text-[#7f91a8]">Пока ничего не подцеплено</div>
                )}
              </div>

              {preparedRepoLabels.length > 0 && quotaSummary?.models.length ? (
                <div className="flex max-w-[46%] flex-wrap justify-end gap-1 text-[10px]">
                  {quotaSummary.models.map((model) => (
                    <span
                      key={model.id}
                      className="rounded-full border border-[#293444] bg-transparent px-2 py-0.5 text-[10px] text-[#aebbd0]"
                    >
                      {model.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {helperText ? (
              <div className={`mt-2 text-[12px] leading-5 ${account.lastError ? "text-[#d7a3a3]" : "text-[#8ea0b6]"}`}>
                {helperText}
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-2.5">
          <QuotaPanel state={quota} />

          <div className="rounded-[16px] border border-[#1f2835] bg-[#111722] p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleConnectRepo}
                disabled={!canSeedRepo || status === "launching" || status === "connecting"}
                className={`inline-flex min-h-[44px] items-center justify-center rounded-full border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  isConnectButtonActive
                    ? "border-emerald-400/20 bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                    : "border-[#2a3340] bg-[#1a212d] text-[#dbe7f4]"
                }`}
              >
                {status === "connecting"
                  ? "Прошиваю…"
                  : canSeedRepo
                    ? "Прошить repo"
                    : selectedRepos.length > 0
                      ? "Уже прошито"
                      : "Выбери repo"}
              </button>
              <button
                type="button"
                onClick={handleStart}
                disabled={status === "launching" || status === "connecting"}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[#c5d0de]/45 bg-[#202833] px-4 py-2.5 text-sm font-semibold text-[#f2f6fc] transition hover:bg-[#283240] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "launching" ? "Открываю…" : "Старт"}
              </button>
            </div>
            <p className="mt-2 px-1 text-[11px] leading-5 text-[#7e8ea5]">{actionHint}</p>
          </div>
        </div>
      </div>

      {bootstrapAssist.kind === "ready" ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-[14px] border border-emerald-400/16 bg-emerald-400/8 px-3 py-2 text-[11px] text-emerald-100">
          <InlineBadge tone="ok">
            {bootstrapAssist.sessionAction === "reused"
              ? "живая сессия"
              : bootstrapAssist.sessionAction === "already-prepared"
                ? "уже прошито"
                : "repo прошит"}
          </InlineBadge>
          <InlineBadge tone="neutral">{bootstrapAssist.repoLabel}</InlineBadge>
          <InlineBadge tone="neutral">{bootstrapAssist.branch}</InlineBadge>
          {bootstrapAssist.sessionId ? (
            <InlineBadge tone="neutral">{shrinkId(bootstrapAssist.sessionId, 6)}</InlineBadge>
          ) : null}
        </div>
      ) : null}

      {statusMessage ? (
        <div
          className={`mt-2 rounded-[14px] border px-3 py-2.5 text-xs ${
            status === "error"
              ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
              : status === "warning"
                ? "border-amber-300/20 bg-amber-300/10 text-amber-50"
                : "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
          }`}
        >
          {statusMessage}
        </div>
      ) : null}
    </article>
  );
}

function SessionInspector({
  state,
  selectedSessionId,
  focus,
  onSelectSession,
  onOpenSession,
}: {
  state: SessionListState;
  selectedSessionId: string | null;
  focus: SessionFocusState | null;
  onSelectSession: (sessionId: string) => void | Promise<void>;
  onOpenSession: (session: SessionSummary) => void | Promise<void>;
}) {
  if (state.kind === "idle" || state.kind === "loading") {
    return <div className="mt-2 text-[11px] text-[#8ea0b6]">Загружаю недавние сессии…</div>;
  }
  if (state.kind === "error") {
    return (
      <div className="mt-2 rounded-[12px] border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-200">
        Не удалось загрузить сессии: {state.error}
      </div>
    );
  }
  if (state.sessions.length === 0) {
    return <div className="mt-2 text-[11px] text-[#8ea0b6]">У этого аккаунта пока не видно недавних Devin-сессий.</div>;
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="space-y-1.5">
        {state.sessions.map((session) => {
          const isActive = session.devinId === selectedSessionId;
          const latest = session.latestStatus?.message || session.currentActivity || session.activityStatus || "Без статуса";
          return (
            <button
              key={session.devinId}
              type="button"
              onClick={() => void onSelectSession(session.devinId)}
              className={`w-full rounded-[12px] border px-3 py-2 text-left transition ${
                isActive
                  ? "border-emerald-400/25 bg-emerald-400/10"
                  : "border-white/8 bg-black/15 hover:border-white/16 hover:bg-white/[0.05]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-[#f1f6ff]">
                    {session.title || "Без названия"}
                  </div>
                  <div className="mt-1 truncate text-[10px] text-[#8da0b8]">{latest}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SessionStatusBadge session={session} />
                  <span className="text-[10px] text-[#7e90a8]">{formatDate(session.updatedAt || session.createdAt || "")}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedSessionId ? (
        <SessionFocusPanel
          session={state.sessions.find((item) => item.devinId === selectedSessionId) || null}
          focus={focus}
          onOpenSession={onOpenSession}
        />
      ) : null}
    </div>
  );
}

function SessionFocusPanel({
  session,
  focus,
  onOpenSession,
}: {
  session: SessionSummary | null;
  focus: SessionFocusState | null;
  onOpenSession: (session: SessionSummary) => void | Promise<void>;
}) {
  if (!session) return null;

  return (
    <div className="rounded-[12px] border border-white/8 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold text-white">{session.title || "Сессия Devin"}</div>
          <div className="mt-1 text-[10px] text-[#7f91a8]">{shrinkId(session.devinId, 8)}</div>
        </div>
        <button
          type="button"
          onClick={() => void onOpenSession(session)}
          className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#eaf2ff] transition hover:bg-white/[0.1]"
        >
          Открыть сессию
        </button>
      </div>

      {focus?.kind === "loading" || !focus ? (
        <div className="mt-3 text-[11px] text-[#8ea0b6]">Загружаю сводку по сессии…</div>
      ) : focus.kind === "error" ? (
        <div className="mt-3 rounded-[10px] border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-[11px] text-rose-200">
          Не удалось получить сводку: {focus.error}
        </div>
      ) : focus.kind === "ready" ? (
        <div className="mt-3 space-y-2.5">
          <div className="grid gap-2 text-[11px] text-[#c6d2e0] sm:grid-cols-2">
            <SessionMetaItem label="Статус" value={focus.session.latestStatus?.message || focus.session.status || "без статуса"} />
            <SessionMetaItem label="Активность" value={focus.session.currentActivity || focus.session.activityStatus || "не указана"} />
            <SessionMetaItem label="Лимит ACU" value={focus.session.maxAcuLimit ? String(focus.session.maxAcuLimit) : "не указан"} />
            <SessionMetaItem label="Обновлено" value={formatDate(focus.session.updatedAt || focus.session.createdAt || "")} />
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <SmallMetric label="Events" value={String(focus.events.totalItems)} />
            <SmallMetric label="Thoughts" value={String(focus.events.counts.devin_thoughts || 0)} />
            <SmallMetric label="Messages" value={String((focus.events.counts.devin_message || 0) + (focus.events.counts.user_message || 0))} />
          </div>

          <SessionTextBlock
            label="Последнее сообщение Devin"
            value={focus.events.latestDevinMessage?.message || focus.events.latestThought?.message || "Пока нет короткого сообщения"}
          />

          {focus.events.latestCommands.length > 0 ? (
            <SessionTextBlock
              label="Последняя команда"
              value={focus.events.latestCommands[0]?.command || "Команда не распознана"}
              mono
            />
          ) : null}

          {focus.pullRequests.length > 0 ? (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#71819a]">PR</div>
              <div className="flex flex-wrap gap-1.5">
                {focus.pullRequests.slice(0, 2).map((pr) => (
                  <a
                    key={pr.id || `${pr.number || "pr"}-${pr.title || "x"}`}
                    href={pr.url || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] text-[#dbe6f2] transition hover:bg-white/[0.1]"
                  >
                    {pr.number ? `#${pr.number}` : "PR"} {pr.title || pr.state || "без названия"}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function QuotaPanel({ state }: { state: QuotaState }) {
  if (state.kind === "idle") return null;
  if (state.kind === "needs-relink") {
    return <QuotaNotice>Сначала заново привяжи аккаунт, чтобы появились живые полоски квоты.</QuotaNotice>;
  }
  if (state.kind === "loading") {
    return <QuotaNotice>Загружаю квоту…</QuotaNotice>;
  }
  if (state.kind === "error") {
    return (
      <div className="rounded-[14px] border border-rose-400/20 bg-rose-400/10 px-3 py-2.5 text-[11px] text-rose-200">
        Не удалось получить квоту: {state.error}
        {state.code === "needs_relink" ? " Перепривяжи аккаунт." : ""}
      </div>
    );
  }

  const summary = buildQuotaSummary(state.usage, state.status, state.models);

  if (summary.dailyPercentage === null && summary.weeklyPercentage === null) {
    return <QuotaNotice>Пока сервис не вернул daily или weekly квоту.</QuotaNotice>;
  }

  return (
    <div className="rounded-[16px] border border-[#1f2835] bg-[linear-gradient(180deg,rgba(28,34,43,0.78),rgba(18,24,31,0.9))] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#71819a]">
        Квота
      </div>
      <div className="space-y-2">
        {summary.dailyPercentage !== null ? (
          <QuotaBar
            label="Daily"
            percentage={summary.dailyPercentage}
            detail={summary.dailyDetail}
          />
        ) : null}
        {summary.weeklyPercentage !== null ? (
          <QuotaBar
            label="Weekly"
            percentage={summary.weeklyPercentage}
            detail={summary.weeklyDetail}
          />
        ) : null}
      </div>
    </div>
  );
}

function buildQuotaSummary(
  usageInput: unknown,
  statusInput: unknown,
  modelsInput: unknown,
): QuotaSummary {
  const usage = usageInput as Record<string, unknown> | null;
  const status = statusInput as Record<string, unknown> | null;
  const planName = pickString(status, ["plan_slug", "plan", "plan_name", "tier"]);
  const dailyUsedPercentage = pickNumber(usage, ["daily_percentage"]);
  const weeklyUsedPercentage = pickNumber(usage, ["weekly_percentage"]);
  const dailyPercentage = toAvailablePercentage(dailyUsedPercentage);
  const weeklyPercentage = toAvailablePercentage(weeklyUsedPercentage);
  const resetAt = pickString(usage, [
    "daily_reset_at",
    "weekly_reset_at",
    "reset_at",
    "next_reset_at",
    "resets_at",
    "period_end",
  ]);

  return {
    planName,
    models: normalizeModels(modelsInput),
    dailyPercentage,
    weeklyPercentage,
    dailyDetail: resetAt
      ? `Сброс ${formatDate(resetAt)}`
      : dailyPercentage === 0
        ? "Квота на сегодня закончилась"
        : "Доступно на сегодня",
    weeklyDetail:
      weeklyPercentage === 0 ? "Квота на неделю закончилась" : "Доступно на неделю",
  };
}

function normalizeModels(value: unknown): ModelSummary[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const models: ModelSummary[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = pickString(record, ["id", "tag", "value"]);
    const label = pickString(record, ["label", "name", "title"]);
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    models.push({ id, label });
  }

  return models;
}

function QuotaBar({
  label,
  percentage,
  detail,
}: {
  label: string;
  percentage: number;
  detail: string;
}) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const tone = getQuotaTone(clamped);
  const width = `${clamped}%`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <div className="min-w-0">
          <div className="font-semibold uppercase tracking-[0.16em] text-[#8fa4bd]">{label}</div>
          <div className="truncate text-[10px] text-[#8293aa]">{detail}</div>
        </div>
        <span className={`shrink-0 font-semibold ${tone.text}`}>{Math.round(clamped)}%</span>
      </div>
      <div className={`h-2 overflow-hidden rounded-full border ${tone.track}`}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${tone.fill}`}
          style={{ width }}
        />
      </div>
    </div>
  );
}

function QuotaNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-white/8 bg-black/15 px-3 py-2 text-[11px] text-[#8ea0b6]">
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#71819a] xl:hidden">
      {children}
    </div>
  );
}

function InlineBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "ok" | "warn" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : tone === "warn"
        ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
        : tone === "danger"
          ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
          : "border-white/10 bg-white/[0.04] text-[#c9d4e2]";

  return <span className={`rounded-full border px-2.5 py-1 ${toneClass}`}>{children}</span>;
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono">
      <span className="mr-1.5 text-[#6f8097]">{label}</span>
      <span className="text-[#d9e3ef]">{value}</span>
    </span>
  );
}

function MetaLine({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="uppercase tracking-[0.14em] text-[#75849a]">{label}</span>
      <span className={mono ? "font-mono text-[#eff5ff]" : "text-[#eff5ff]"}>{value}</span>
    </div>
  );
}

function SessionMetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-white/8 bg-white/[0.03] px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#71819a]">{label}</div>
      <div className="mt-1 text-[11px] text-[#edf4ff]">{value}</div>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-white/8 bg-white/[0.03] px-2.5 py-2 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#71819a]">{label}</div>
      <div className="mt-1 text-[14px] font-semibold text-white">{value}</div>
    </div>
  );
}

function SessionTextBlock({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#71819a]">{label}</div>
      <div className={`rounded-[10px] border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] leading-5 text-[#dbe5f1] ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function SessionStatusBadge({ session }: { session: SessionSummary }) {
  const latest = session.latestStatus;
  const isBlocked = latest?.userActionRequired || latest?.enum === "blocked";
  const isRunning = session.status === "running" || session.activityStatus === "coding";

  if (isBlocked) {
    return (
      <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
        ждёт
      </span>
    );
  }
  if (isRunning) {
    return (
      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
        активна
      </span>
    );
  }
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d2dceb]">
      {humanize(session.status || latest?.enum || "session")}
    </span>
  );
}

function shrinkId(value: string, size: number): string {
  if (value.length <= size * 2 + 1) return value;
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}

function buildSessionWebUrl(devinId: string): string {
  const normalized = devinId.replace(/^devin-/, "");
  return `https://app.devin.ai/sessions/${normalized}`;
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ");
}

function buildAttachStatusMessage(
  action: "created" | "reused" | "already-prepared",
  repoLabel: string,
): string {
  if (action === "reused") {
    return `Для ${repoLabel} уже была подходящая живая Devin-сессия. Повторно prompt не отправлял.`;
  }
  if (action === "already-prepared") {
    return `${repoLabel} уже прошит для этого аккаунта. Повторная прошивка не нужна.`;
  }
  return `Создал новую backend-сессию для ${repoLabel}. Она должна только сделать clone/check access и остановиться.`;
}

function buildAttachPanelMessage(action: "created" | "reused" | "already-prepared"): string {
  if (action === "reused") {
    return "Новая сессия не создавалась: для этого repo уже есть подходящая живая Devin-сессия.";
  }
  if (action === "already-prepared") {
    return "Этот repo уже был прошит раньше, поэтому тот же самый attach повторно не отправлялся.";
  }
  return "Backend Devin принял новую attach-only сессию. Дальше можно открыть её через «Старт» и проверить, что repo действительно появился локально.";
}

function getPendingRepos(
  selectedRepos: ActiveRepoSelection[],
  preparedRepos: PreparedRepoSummary[],
): ActiveRepoSelection[] {
  const prepared = new Set(preparedRepos.map((repo) => repo.fullName.toLowerCase()));
  return selectedRepos.filter((repo) => !prepared.has(formatActiveRepoLabel(repo).toLowerCase()));
}

function upsertPreparedRepo(
  current: PreparedRepoSummary[],
  next: PreparedRepoSummary,
): PreparedRepoSummary[] {
  const key = next.fullName.toLowerCase();
  const filtered = current.filter((repo) => repo.fullName.toLowerCase() !== key);
  return [next, ...filtered];
}

function findPreferredPreparedSession(
  preparedRepos: PreparedRepoSummary[],
  selectedRepos: ActiveRepoSelection[],
): PreparedRepoSummary | null {
  for (const selected of selectedRepos) {
    const match = preparedRepos.find(
      (repo) => repo.fullName.toLowerCase() === formatActiveRepoLabel(selected).toLowerCase() && repo.sessionId,
    );
    if (match) return match;
  }

  return preparedRepos.find((repo) => repo.sessionId) || null;
}

function describeBackendStartError(
  error: ConnectRepoResponse["backendStartError"],
): string | null {
  if (!error) return null;
  const detail = String(error.detail || "").toLowerCase();
  if (detail.includes("out_of_quota")) {
    return "у аккаунта закончилась квота";
  }
  if (detail.includes("billing error")) {
    return "у аккаунта есть billing-блокировка";
  }
  if (error.status === 403) {
    return "Devin отверг запуск новой сессии";
  }
  return error.message || null;
}

function toAvailablePercentage(usedPercentage: number | null): number | null {
  if (usedPercentage === null) return null;
  return Math.max(0, Math.min(100, 100 - usedPercentage));
}

function getQuotaTone(percentage: number) {
  if (percentage > 70) {
    return {
      text: "text-emerald-300",
      fill: "bg-emerald-400",
      track: "border-white/10 bg-[rgba(52,211,153,0.14)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
    };
  }
  if (percentage >= 30) {
    return {
      text: "text-amber-200",
      fill: "bg-amber-300",
      track: "border-white/10 bg-[rgba(252,211,77,0.14)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
    };
  }
  return {
    text: "text-rose-200",
    fill: "bg-rose-400",
    track: "border-white/10 bg-[rgba(251,113,133,0.14)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
  };
}

function pickNumber(obj: Record<string, unknown> | null, keys: string[]): number | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number") return value;
    if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  }
  return null;
}

function pickString(obj: Record<string, unknown> | null, keys: string[]): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({
  testStatus,
  rateLimitedUntil,
}: {
  testStatus?: string | null;
  rateLimitedUntil?: string | null;
}) {
  const now = Date.now();
  const cooledUntil = rateLimitedUntil ? new Date(rateLimitedUntil).getTime() : null;
  const isRateLimited = cooledUntil !== null && cooledUntil > now;

  if (isRateLimited) {
    return (
      <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-200">
        пауза
      </span>
    );
  }
  if (testStatus === "valid" || testStatus === "ok") {
    return (
      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
        готов
      </span>
    );
  }
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#aeb8c8]">
      {testStatus || "неизвестно"}
    </span>
  );
}
