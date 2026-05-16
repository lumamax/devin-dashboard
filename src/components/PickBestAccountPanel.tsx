"use client";

import { useEffect, useState } from "react";

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
  const [targetRepo, setTargetRepo] = useState("");
  const [expanded, setExpanded] = useState(false);

  async function fetchRanking() {
    setState({ kind: "loading" });
    try {
      const params = new URLSearchParams();
      if (targetRepo.trim()) params.set("targetRepo", targetRepo.trim());
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

  useEffect(() => {
    void fetchRanking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="overflow-hidden rounded-[24px] border border-white/10 bg-[rgba(11,14,20,0.88)] shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur">
      <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Pick best account</h2>
          <p className="mt-1 text-sm text-[#93a0b2]">
            Score accounts by quota headroom, lifecycle state, and repo readiness.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={targetRepo}
            onChange={(e) => setTargetRepo(e.target.value)}
            placeholder="owner/repo (optional)"
            className="h-8 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white placeholder:text-[#6b7a8e] focus:border-indigo-400/40 focus:outline-none"
          />
          <button
            onClick={() => void fetchRanking()}
            disabled={state.kind === "loading"}
            className="h-8 rounded-lg border border-indigo-400/30 bg-indigo-500/20 px-4 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/30 disabled:opacity-50"
          >
            {state.kind === "loading" ? "Scoring\u2026" : "Score"}
          </button>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        {state.kind === "idle" || state.kind === "loading" ? (
          <div className="text-sm text-[#8ea0b6]">
            {state.kind === "loading" ? "Fetching quota data and scoring accounts\u2026" : "Click Score to rank accounts."}
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
    <div className="space-y-4">
      {best ? (
        <div className="flex items-center gap-3 rounded-[18px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/15 text-sm font-bold text-emerald-200">
            1
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-emerald-100">{best.name}</div>
            <div className="text-xs text-emerald-300/70">
              Score {best.score}/100 &mdash; best available account for the next task
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[14px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          No qualified account found. All accounts are either exhausted, rate-limited, or need re-linking.
        </div>
      )}

      <button
        onClick={onToggleExpand}
        className="text-xs font-semibold text-[#8fa4bd] transition hover:text-white"
      >
        {expanded ? "Hide full ranking \u25B2" : `Show full ranking (${ranked.length} accounts) \u25BC`}
      </button>

      {expanded && (
        <div className="space-y-1.5">
          {ranked.map((account, index) => (
            <RankedAccountRow key={account.accountId} account={account} rank={index + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function RankedAccountRow({ account, rank }: { account: ScoredAccount; rank: number }) {
  const lifecycleColor = getLifecycleColor(account.lifecycle);

  return (
    <div
      className={`grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-[14px] border px-3 py-2.5 ${
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
        <div className="mt-0.5 flex flex-wrap gap-3 text-[10px] text-[#8293aa]">
          <span>Q: {account.quotaScore}</span>
          <span>L: {account.lifecycleScore}</span>
          <span>R: {account.repoScore}</span>
          {account.dailyPercentage !== null && (
            <span>Daily: {Math.round(account.dailyPercentage)}%</span>
          )}
          {account.weeklyPercentage !== null && (
            <span>Weekly: {Math.round(account.weeklyPercentage)}%</span>
          )}
          {account.assignedRepoFullName && (
            <span>Repo: {account.assignedRepoFullName}</span>
          )}
        </div>
        {account.disqualifyReason && (
          <div className="mt-0.5 text-[10px] text-rose-300/70">{account.disqualifyReason}</div>
        )}
      </div>

      <div className="text-right text-sm font-semibold text-[#aab5c4]">
        {account.score}
      </div>
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
