"use client";

import { useEffect, useState } from "react";
import {
  ACTIVE_REPO_EVENT,
  formatActiveRepoLabel,
  getActiveRepoSelections,
  type ActiveRepoSelection,
} from "@/lib/activeRepo";

type ScoredAccount = {
  accountId: string;
  name: string;
  score: number;
  quotaScore: number;
  lifecycleScore: number;
  repoScore: number;
  lifecycle: string;
  dailyPercentage: number | null;
  weeklyPercentage: number | null;
  assignedRepoFullName: string | null;
  disqualified: boolean;
  disqualifyReason: string | null;
};

type PickBestResponse = {
  ok: boolean;
  error?: string;
  best: { accountId: string; name: string; score: number } | null;
  ranked: ScoredAccount[];
  targetRepo: string | null;
};

type PanelState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; error: string }
  | { kind: "ready"; data: PickBestResponse };

export function PickBestAccountPanel() {
  const [state, setState] = useState<PanelState>({ kind: "idle" });
  const [selectedRepos, setSelectedRepos] = useState<ActiveRepoSelection[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const syncRepos = () => {
      setSelectedRepos(getActiveRepoSelections());
    };

    const handleRepoSelection = (event: Event) => {
      const detail = (event as CustomEvent<ActiveRepoSelection[]>).detail;
      if (Array.isArray(detail)) {
        setSelectedRepos(detail);
        return;
      }
      syncRepos();
    };

    syncRepos();
    window.addEventListener(ACTIVE_REPO_EVENT, handleRepoSelection as EventListener);
    window.addEventListener("storage", syncRepos);

    return () => {
      window.removeEventListener(ACTIVE_REPO_EVENT, handleRepoSelection as EventListener);
      window.removeEventListener("storage", syncRepos);
    };
  }, []);

  useEffect(() => {
    void fetchRanking(selectedRepos[0] ? formatActiveRepoLabel(selectedRepos[0]) : null);
  }, [selectedRepos]);

  async function fetchRanking(targetRepo: string | null) {
    setState({ kind: "loading" });
    try {
      const params = new URLSearchParams();
      if (targetRepo) params.set("targetRepo", targetRepo);
      const res = await fetch(`/api/accounts/pick-best?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as PickBestResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setState({ kind: "ready", data: json });
    } catch (err: unknown) {
      setState({
        kind: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const targetRepoLabel = selectedRepos[0] ? formatActiveRepoLabel(selectedRepos[0]) : null;

  return (
    <section className="overflow-hidden rounded-[22px] border border-white/10 bg-[rgba(11,14,20,0.88)] shadow-[0_20px_55px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="flex items-start justify-between gap-3 p-4">
        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8596ad]">
            Маршрутизация
          </div>
          <h2 className="text-base font-semibold text-white">Лучший аккаунт</h2>
          <p className="mt-1 text-sm leading-6 text-[#93a0b2]">
            Быстрая подсказка, куда лучше отправлять следующий repo.
          </p>
        </div>
        <button
          onClick={() => void fetchRanking(targetRepoLabel)}
          disabled={state.kind === "loading"}
          className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-[#e6eef8] transition hover:bg-white/[0.08] disabled:opacity-50"
        >
          {state.kind === "loading" ? "Считаю…" : "Обновить"}
        </button>
      </div>

      <div className="border-t border-white/8 px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#8ea0b6]">
          <span>Текущий ориентир:</span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[#dce6f1]">
            {targetRepoLabel || "без фильтра по repo"}
          </span>
        </div>

        {state.kind === "idle" || state.kind === "loading" ? (
          <div className="text-sm text-[#8ea0b6]">
            {state.kind === "loading" ? "Собираю квоту и сравниваю аккаунты…" : "Жду первый расчёт."}
          </div>
        ) : state.kind === "error" ? (
          <div className="rounded-[14px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
            {state.error}
          </div>
        ) : (
          <RankingResult data={state.data} expanded={expanded} onToggleExpand={() => setExpanded(!expanded)} />
        )}
      </div>
    </section>
  );
}

function RankingResult({
  data,
  expanded,
  onToggleExpand,
}: {
  data: PickBestResponse;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const { best, ranked } = data;

  return (
    <div className="space-y-3">
      {best ? (
        <div className="rounded-[18px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/85">
            Рекомендация
          </div>
          <div className="mt-1 text-base font-semibold text-emerald-50">{best.name}</div>
          <div className="mt-1 text-sm text-emerald-200/75">Score {best.score}/100</div>
        </div>
      ) : (
        <div className="rounded-[14px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          Сейчас нет квалифицированного аккаунта: все exhausted, rate-limited или требуют relink.
        </div>
      )}

      <button
        onClick={onToggleExpand}
        className="text-xs font-semibold text-[#8fa4bd] transition hover:text-white"
      >
        {expanded ? "Скрыть полный рейтинг" : `Показать полный рейтинг (${ranked.length})`}
      </button>

      {expanded ? (
        <div className="space-y-1.5">
          {ranked.map((account, index) => (
            <RankedAccountRow key={account.accountId} account={account} rank={index + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RankedAccountRow({ account, rank }: { account: ScoredAccount; rank: number }) {
  const lifecycleColor = getLifecycleColor(account.lifecycle);

  return (
    <div
      className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border px-3 py-2.5 ${
        account.disqualified
          ? "border-white/5 bg-white/[0.02] opacity-50"
          : "border-white/8 bg-white/[0.03]"
      }`}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-[#8fa4bd]">
        {rank}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-white">{account.name}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${lifecycleColor}`}>
            {account.lifecycle}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-[#8293aa]">
          <span>Q {account.quotaScore}</span>
          <span>L {account.lifecycleScore}</span>
          <span>R {account.repoScore}</span>
          {account.dailyPercentage !== null ? <span>Day {Math.round(account.dailyPercentage)}%</span> : null}
          {account.weeklyPercentage !== null ? <span>Week {Math.round(account.weeklyPercentage)}%</span> : null}
        </div>
        {account.disqualifyReason ? (
          <div className="mt-0.5 text-[10px] text-rose-300/70">{account.disqualifyReason}</div>
        ) : null}
      </div>

      <div className="text-right text-sm font-semibold text-[#aab5c4]">{account.score}</div>
    </div>
  );
}

function getLifecycleColor(lifecycle: string): string {
  switch (lifecycle) {
    case "active":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
    case "draining":
      return "border-amber-400/20 bg-amber-400/10 text-amber-200";
    case "errored":
      return "border-rose-400/20 bg-rose-400/10 text-rose-200";
    case "needs-relink":
      return "border-orange-400/20 bg-orange-400/10 text-orange-200";
    case "rate-limited":
      return "border-red-400/20 bg-red-400/10 text-red-200";
    case "exhausted":
      return "border-zinc-400/20 bg-zinc-400/10 text-zinc-300";
    default:
      return "border-white/10 bg-white/5 text-[#aab5c4]";
  }
}
