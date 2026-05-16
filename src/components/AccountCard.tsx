"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ACTIVE_REPO_EVENT,
  formatActiveRepoLabel,
  getActiveRepoSelection,
  type ActiveRepoSelection,
} from "@/lib/activeRepo";
import type { AccountSummary } from "@/lib/omniroute";

type Status = "idle" | "launching" | "connecting" | "success" | "error";

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
  prompt?: string;
  assignment?: {
    owner?: string;
    repo?: string;
    branch?: string;
    fullName?: string;
  };
  autoSeed?: {
    attempted?: boolean;
    ok?: boolean;
    reason?: string | null;
    action?: string | null;
  };
  launched?: {
    pid?: number;
  };
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

export function AccountCard({ account }: { account: AccountSummary }) {
  const [status, setStatus] = useState<Status>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaState>({ kind: "idle" });
  const [activeRepo, setActiveRepo] = useState<ActiveRepoSelection | null>(null);
  const [assignedRepoFullName, setAssignedRepoFullName] = useState(account.assignedRepoFullName || null);
  const [assignedBranch, setAssignedBranch] = useState(account.assignedBranch || null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionsState, setSessionsState] = useState<SessionListState>({ kind: "idle" });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionFocus, setSessionFocus] = useState<Record<string, SessionFocusState>>({});

  useEffect(() => {
    setAssignedRepoFullName(account.assignedRepoFullName || null);
    setAssignedBranch(account.assignedBranch || null);
  }, [account.assignedBranch, account.assignedRepoFullName]);

  useEffect(() => {
    setSessionsOpen(false);
    setSessionsState({ kind: "idle" });
    setSelectedSessionId(null);
    setSessionFocus({});
  }, [account.id]);

  useEffect(() => {
    const syncActiveRepo = () => {
      setActiveRepo(getActiveRepoSelection());
    };

    const handleActiveRepo = (event: Event) => {
      const detail = (event as CustomEvent<ActiveRepoSelection>).detail;
      if (detail) {
        setActiveRepo(detail);
        return;
      }
      syncActiveRepo();
    };

    syncActiveRepo();
    window.addEventListener(ACTIVE_REPO_EVENT, handleActiveRepo as EventListener);
    window.addEventListener("storage", syncActiveRepo);

    return () => {
      window.removeEventListener(ACTIVE_REPO_EVENT, handleActiveRepo as EventListener);
      window.removeEventListener("storage", syncActiveRepo);
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

  async function copyPrompt(prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      return true;
    } catch {
      return false;
    }
  }

  async function handleLaunch() {
    setStatus("launching");
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setStatus("success");
      setStatusMessage(`Chrome открыт (pid ${json.pid})`);
    } catch (err: unknown) {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "Unknown error");
    }
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

      const resolvedSession = detailJson.session;
      const resolvedEvents = eventsJson.events;

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

    if (!activeRepo) {
      setStatus("error");
      setStatusMessage("Сначала выбери рабочее репо в верхнем блоке.");
      return;
    }

    setStatus("connecting");
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/accounts/${account.id}/connect-repo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeRepo),
      });
      const json = (await res.json()) as ConnectRepoResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      const fullName = json.assignment?.fullName || formatActiveRepoLabel(activeRepo);
      const nextBranch = json.assignment?.branch || activeRepo.branch;
      const copied = json.prompt ? await copyPrompt(json.prompt) : false;
      const autoSeedOk = json.autoSeed?.ok === true;
      const autoSeedAttempted = json.autoSeed?.attempted === true;
      const autoSeedReason = json.autoSeed?.reason || null;
      const autoSeedReasonText =
        autoSeedReason === "no_seat_allocated"
          ? "у аккаунта сейчас нет seat для запуска"
          : autoSeedReason === "repository_selection_required"
            ? "Devin просит сначала выбрать репозитории"
            : autoSeedReason === "send_button_not_found"
              ? "кнопка отправки пока не появилась"
              : autoSeedAttempted
                ? "автоподстановка не добилась отправки"
                : null;

      setAssignedRepoFullName(fullName);
      setAssignedBranch(nextBranch);
      setStatus("success");
      setStatusMessage(
        autoSeedOk
          ? `Аккаунт открыт, репо ${fullName} закреплено, prompt уже отправлен в Devin.`
          : copied
            ? `Аккаунт открыт, репо ${fullName} закреплено, prompt скопирован${autoSeedReasonText ? `, ${autoSeedReasonText}` : ""}.`
            : `Аккаунт открыт, репо ${fullName} закреплено. Prompt готов, но clipboard не сработал.`,
      );
    } catch (err: unknown) {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "Unknown error");
    }
  }

  const displayName = account.name?.trim() || account.id || "Unnamed Devin account";
  const helperText = account.lastError
    ? account.lastError
    : account.hasCreds
      ? "Сессия сохранена. Можно открыть профиль отдельно или сразу запустить его с рабочим репо."
      : "Для живой квоты и надёжного запуска лучше заново добавить этот аккаунт через кнопку сверху.";
  const quotaSummary =
    quota.kind === "ready" ? buildQuotaSummary(quota.usage, quota.status, quota.models) : null;
  const selectedSession = selectedSessionId ? sessionFocus[selectedSessionId] : null;

  return (
    <article className="grid gap-2.5 px-4 py-3 transition hover:bg-white/[0.02] xl:grid-cols-[minmax(280px,1.08fr)_minmax(330px,1fr)_minmax(236px,0.72fr)_180px] xl:items-center xl:gap-4 xl:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-white sm:text-[15px]">{displayName}</h3>
          <StatusBadge testStatus={account.testStatus} rateLimitedUntil={account.rateLimitedUntil} />
          {!account.hasCreds ? <InlineBadge tone="warn">нужно перелинковать</InlineBadge> : null}
          {account.lastError ? <InlineBadge tone="danger">есть ошибка</InlineBadge> : null}
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#9fb0c5]">
          {account.updatedAt ? <MetaPill label="updated" value={formatDate(account.updatedAt)} /> : null}
        </div>

        <p
          className={`mt-2 max-w-xl text-[12px] leading-5 ${
            account.lastError ? "text-[#d7a3a3]" : "text-[#8ea0b6]"
          } ${account.hasCreds && !account.lastError ? "xl:hidden" : ""}`}
        >
          {helperText}
        </p>
      </div>

      <div className="space-y-2 xl:pr-1">
        <SectionLabel>Session</SectionLabel>
        <div className="rounded-[14px] border border-white/8 bg-white/[0.03] p-2.5 text-[11px] text-[#c7d3e0]">
          <MetaLine label="Сессия" value={account.hasCreds ? "Готова" : "Нужно войти снова"} />
          <MetaLine label="Репо" value={assignedRepoFullName || "ещё не закреплено"} mono />
          <MetaLine label="Branch" value={assignedBranch || "по выбранному репо"} mono />
        </div>

        {quotaSummary && (quotaSummary.planName || quotaSummary.models.length > 0) ? (
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#71819a]">
              План и режимы
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quotaSummary.planName ? (
                <InlineBadge tone="neutral">План {humanize(quotaSummary.planName)}</InlineBadge>
              ) : null}
              {quotaSummary.models.map((model) => (
                <InlineBadge key={model.id} tone="neutral">
                  {model.label}
                </InlineBadge>
              ))}
            </div>
          </div>
        ) : null}

        {account.hasCreds ? (
          <div className="rounded-[14px] border border-white/8 bg-white/[0.03] p-2.5 text-[11px] text-[#c7d3e0]">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#71819a]">
                Recent sessions
              </div>
              <div className="flex items-center gap-2">
                {sessionsOpen && sessionsState.kind === "ready" ? (
                  <button
                    type="button"
                    onClick={() => void loadSessions(true)}
                    className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#92b7ff] transition hover:text-white"
                  >
                    Обновить
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void toggleSessions()}
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#92b7ff] transition hover:text-white"
                >
                  {sessionsOpen ? "Скрыть" : "Показать"}
                </button>
              </div>
            </div>

            {sessionsOpen ? (
              <SessionInspector
                state={sessionsState}
                selectedSessionId={selectedSessionId}
                focus={selectedSession}
                onSelectSession={handleSelectSession}
                onOpenSession={handleOpenSession}
              />
            ) : (
              <div className="mt-2 text-[11px] leading-5 text-[#8394aa]">
                Последние Devin-сессии этого аккаунта и краткая сводка по выбранной сессии.
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="xl:w-full xl:max-w-[236px] xl:justify-self-end">
        <SectionLabel>Quota</SectionLabel>
        <QuotaPanel state={quota} />
      </div>

      <div className="flex flex-col items-start gap-2 xl:items-end">
        <div className="flex w-full flex-col gap-2 sm:w-auto xl:items-end">
          <button
            type="button"
            onClick={handleLaunch}
            disabled={status === "launching" || status === "connecting"}
            className="inline-flex min-w-[160px] items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "launching" ? "Открываю…" : "Открыть"}
          </button>
          <button
            type="button"
            onClick={handleConnectRepo}
            disabled={status === "launching" || status === "connecting"}
            className="inline-flex min-w-[160px] items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-[#e6eef8] transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "connecting" ? "Готовлю…" : "Открыть + репо"}
          </button>
        </div>
        <p className="max-w-[180px] text-right text-[11px] leading-5 text-[#7e8ea5]">
          {activeRepo ? `Активно: ${formatActiveRepoLabel(activeRepo)}` : "Сначала выбери рабочее репо сверху"}
        </p>
      </div>

      {statusMessage ? (
        <div
          className={`rounded-[16px] border px-3 py-2.5 text-xs xl:col-span-4 ${
            status === "error"
              ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
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
    <div className="rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.03))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="space-y-1.5">
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
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-[10px]">
        <span className="font-semibold uppercase tracking-[0.16em] text-[#8fa4bd]">{label}</span>
        <span className={`font-semibold ${tone.text}`}>{Math.round(clamped)}%</span>
      </div>
      <div className={`h-1.5 overflow-hidden rounded-full border ${tone.track}`}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${tone.fill}`}
          style={{ width }}
        />
      </div>
      <div className="text-[10px] text-[#8293aa]">{detail}</div>
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
  return `https://app.devin.ai/sessions/${normalized}?tab=README.md`;
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ");
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
