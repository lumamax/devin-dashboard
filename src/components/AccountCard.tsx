"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { AccountSummary } from "@/lib/omniroute";

type Status = "idle" | "launching" | "success" | "error";

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

type QuotaState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "needs-relink" }
  | { kind: "error"; error: string; code?: string }
  | { kind: "ready"; usage: unknown; status: unknown; models: unknown };

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

  const displayName = account.name?.trim() || account.id || "Unnamed Devin account";
  const helperText = account.lastError
    ? account.lastError
    : account.hasCreds
      ? "Сессия сохранена. Смотри квоту справа и открывай нужный профиль в отдельном окне."
      : "Для живой квоты и надёжного запуска лучше заново добавить этот аккаунт через кнопку сверху.";
  const quotaSummary =
    quota.kind === "ready" ? buildQuotaSummary(quota.usage, quota.status, quota.models) : null;

  return (
    <article className="grid gap-2.5 px-4 py-3 transition hover:bg-white/[0.02] xl:grid-cols-[minmax(280px,1.08fr)_minmax(330px,1fr)_minmax(236px,0.72fr)_140px] xl:items-center xl:gap-4 xl:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-white sm:text-[15px]">{displayName}</h3>
          <StatusBadge testStatus={account.testStatus} rateLimitedUntil={account.rateLimitedUntil} />
          {!account.hasCreds ? <InlineBadge tone="warn">нужно перелинковать</InlineBadge> : null}
          {account.lastError ? <InlineBadge tone="danger">есть ошибка</InlineBadge> : null}
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#9fb0c5]">
          {account.updatedAt ? <MetaPill label="updated" value={formatDate(account.updatedAt)} /> : null}
          {typeof account.priority === "number" ? (
            <MetaPill label="slot" value={String(account.priority)} />
          ) : null}
          {account.orgId ? (
            <MetaPill label="org" value={shrinkId(account.orgId.replace(/^org-/, ""), 5)} />
          ) : null}
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
          <MetaLine
            label="Org"
            value={account.orgId ? shrinkId(account.orgId.replace(/^org-/, ""), 6) : "ещё не поймали"}
            mono
          />
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
            disabled={status === "launching"}
            className="inline-flex min-w-[136px] items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "launching" ? "Открываю…" : "Открыть"}
          </button>
          <a
            href="#repo-bootstrap"
            className="inline-flex min-w-[136px] items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-[#e6eef8] transition hover:bg-white/[0.08]"
          >
            Подключить репо
          </a>
        </div>
        <p className="text-right text-[11px] leading-5 text-[#7e8ea5] xl:hidden">Окно Chrome и быстрый repo-bootstrap</p>
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

function shrinkId(value: string, size: number): string {
  if (value.length <= size * 2 + 1) return value;
  return `${value.slice(0, size)}…${value.slice(-size)}`;
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
