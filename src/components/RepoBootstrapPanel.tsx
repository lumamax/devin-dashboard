"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ACTIVE_REPO_MODEL_OPTIONS,
  DEFAULT_ACTIVE_REPO_MODEL,
  formatActiveRepoLabel,
  getActiveRepoModel,
  getActiveRepoSelections,
  saveActiveRepoModel,
  saveActiveRepoSelections,
  type ActiveRepoModel,
  type ActiveRepoSelection,
} from "@/lib/activeRepo";

type RepositoryOption = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  repo: string;
  defaultBranch: string | null;
  private: boolean | null;
};

type GitHubStatusResponse = {
  ok: boolean;
  configured?: boolean;
  missing?: string[];
  ownerHint?: string | null;
  error?: string;
  app?: {
    slug?: string;
    owner?: {
      login?: string | null;
    } | null;
  } | null;
  repositories?: Array<{
    id?: number;
    name?: string;
    fullName?: string;
    full_name?: string;
    private?: boolean | null;
    defaultBranch?: string | null;
    default_branch?: string | null;
  }>;
};

type StatusState =
  | { kind: "loading" }
  | { kind: "error"; error: string }
  | {
      kind: "ready";
      configured: boolean;
      ownerHint: string | null;
      appSlug: string | null;
      repositories: RepositoryOption[];
      missing: string[];
      error: string | null;
    };

export function RepoBootstrapPanel() {
  const [status, setStatus] = useState<StatusState>({ kind: "loading" });
  const [selectedRepos, setSelectedRepos] = useState<ActiveRepoSelection[]>([]);
  const [selectedModel, setSelectedModel] = useState<ActiveRepoModel>(DEFAULT_ACTIVE_REPO_MODEL);

  useEffect(() => {
    setSelectedRepos(getActiveRepoSelections());
    setSelectedModel(getActiveRepoModel());
    void loadStatus();
  }, []);

  const selectedLabels = useMemo(
    () => selectedRepos.map((repo) => formatActiveRepoLabel(repo)),
    [selectedRepos],
  );

  async function loadStatus() {
    setStatus({ kind: "loading" });
    try {
      const res = await fetch("/api/github-app/status", { cache: "no-store" });
      const json = (await res.json()) as GitHubStatusResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      const repositories = normalizeRepositories(json.repositories);
      const savedSelection = pickSelectableSelections(repositories, getActiveRepoSelections());
      const nextSelection =
        savedSelection.length > 0 ? savedSelection : repositories.length === 1 ? [toSelection(repositories[0]!)] : [];

      setStatus({
        kind: "ready",
        configured: Boolean(json.configured),
        ownerHint: pickOwnerHint(json),
        appSlug: json.app?.slug || null,
        repositories,
        missing: json.missing || [],
        error: json.error || null,
      });
      setSelectedRepos(nextSelection);
      saveActiveRepoSelections(nextSelection);
    } catch (err) {
      setStatus({
        kind: "error",
        error: err instanceof Error ? err.message : "Не удалось получить статус GitHub App",
      });
    }
  }

  function updateSelections(nextSelections: ActiveRepoSelection[]) {
    setSelectedRepos(nextSelections);
    saveActiveRepoSelections(nextSelections);
  }

  function updateModel(nextModel: ActiveRepoModel) {
    setSelectedModel(nextModel);
    saveActiveRepoModel(nextModel);
  }

  function toggleRepository(option: RepositoryOption) {
    const selection = toSelection(option);
    const exists = selectedRepos.some(
      (repo) => repo.owner === selection.owner && repo.repo === selection.repo,
    );

    if (exists) {
      updateSelections(
        selectedRepos.filter(
          (repo) => !(repo.owner === selection.owner && repo.repo === selection.repo),
        ),
      );
      return;
    }

    const next = sortSelectionsByRepositoryOrder([...selectedRepos, selection], getRepositories(status));
    updateSelections(next);
  }

  function selectAll() {
    const repositories = getRepositories(status);
    updateSelections(repositories.map((repo) => toSelection(repo)));
  }

  function clearAll() {
    updateSelections([]);
  }

  return (
    <section className="overflow-hidden rounded-[20px] border border-[#1e2734] bg-[linear-gradient(180deg,rgba(13,17,24,0.98),rgba(8,11,17,0.94))] shadow-[0_18px_46px_rgba(0,0,0,0.32)] backdrop-blur">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8596ad]">
              <span className="rounded-full border border-[#2a3341] bg-[#171d28] px-3 py-1 text-[#dce6f1]">
                Прошивка repo
              </span>
              {selectedRepos.length > 0 ? (
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-100">
                  выбрано {selectedRepos.length}
                </span>
              ) : null}
            </div>
            <h2 className="text-base font-semibold text-white">Репозитории</h2>
            <p className="mt-1 text-sm leading-6 text-[#95a3b6]">Выбери, что прошивать в новые сессии.</p>
          </div>
          <StatusChip state={status} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadStatus()}
            className="inline-flex items-center justify-center rounded-full border border-[#2a3341] bg-[#171d28] px-3.5 py-2 text-xs font-semibold text-[#e6eef8] transition hover:bg-[#1d2431]"
          >
            Обновить
          </button>
          <button
            type="button"
            onClick={selectAll}
            disabled={getRepositories(status).length === 0}
            className="inline-flex items-center justify-center rounded-full border border-[#2a3341] bg-[#171d28] px-3.5 py-2 text-xs font-semibold text-[#e6eef8] transition hover:bg-[#1d2431] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Все
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={selectedRepos.length === 0}
            className="inline-flex items-center justify-center rounded-full border border-[#2a3341] bg-[#171d28] px-3.5 py-2 text-xs font-semibold text-[#e6eef8] transition hover:bg-[#1d2431] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Очистить
          </button>
        </div>
      </div>

      <div className="border-t border-white/6 p-4">
        {status.kind === "loading" ? (
          <Notice tone="info" title="Проверяю GitHub App">
            Подтягиваю доступные репозитории.
          </Notice>
        ) : null}

        {status.kind === "error" ? (
          <Notice tone="error" title="GitHub App не ответил">
            {status.error}
          </Notice>
        ) : null}

        {status.kind === "ready" && !status.configured ? (
          <Notice tone="error" title="Нужно закончить локальную настройку">
            GitHub App ещё не готов локально. Не хватает: {status.missing.join(", ")}.
          </Notice>
        ) : null}

        {status.kind === "ready" && status.configured ? (
          <div className="space-y-4">
            {status.repositories.length > 0 ? (
              <>
                <div className="space-y-2.5">
                  {status.repositories.map((option) => {
                    const checked = selectedRepos.some(
                      (repo) => repo.owner === option.owner && repo.repo === option.repo,
                    );
                    return (
                      <button
                        key={option.id || option.fullName}
                        type="button"
                        onClick={() => toggleRepository(option)}
                        className={`w-full rounded-[16px] border px-3.5 py-3 text-left transition ${
                          checked
                            ? "border-emerald-400/25 bg-emerald-400/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                            : "border-[#26303d] bg-[#111722] hover:border-[#314055] hover:bg-[#151c27]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">{option.fullName}</div>
                            <div className="mt-1 text-xs text-[#8fa0b5]">Branch {option.defaultBranch || "main"}</div>
                          </div>
                          <span
                            className={`mt-0.5 inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                              checked
                                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                                : "border-[#2b3544] bg-transparent text-[#9cb0c6]"
                            }`}
                          >
                            {checked ? "в работе" : "доступен"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-[16px] border border-[#202835] bg-[#111722] p-3.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7990ab]">
                      Новая сессия
                    </div>
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-100">
                      {selectedModel.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ACTIVE_REPO_MODEL_OPTIONS.map((option) => {
                      const active = option.id === selectedModel.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => updateModel(option)}
                          className={`rounded-[14px] border px-3 py-2 text-left text-sm transition ${
                            active
                              ? "border-emerald-400/25 bg-emerald-400/12 text-white"
                              : "border-[#26303d] bg-[#171d28] text-[#b8c6d8] hover:border-[#314055] hover:bg-[#1b2230]"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedLabels.length > 0 ? (
                  <div className="rounded-[16px] border border-[#202835] bg-[#111722] px-3.5 py-3 text-sm text-[#8fa0b5]">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7990ab]">
                      Очередь прошивки
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedLabels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-[16px] border border-dashed border-[#2a3340] bg-[#111722] px-4 py-3 text-sm text-[#8fa0b5]">
                Репозиториев пока нет.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function getRepositories(state: StatusState): RepositoryOption[] {
  return state.kind === "ready" ? state.repositories : [];
}

function toSelection(option: RepositoryOption): ActiveRepoSelection {
  return {
    owner: option.owner,
    repo: option.repo,
    branch: option.defaultBranch || "main",
  };
}

function normalizeRepositories(input: GitHubStatusResponse["repositories"]): RepositoryOption[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const out: RepositoryOption[] = [];

  for (const raw of input) {
    const fullName = raw.fullName || raw.full_name || "";
    const [owner, repo] = fullName.split("/");
    if (!owner || !repo || seen.has(fullName)) continue;
    seen.add(fullName);
    out.push({
      id: typeof raw.id === "number" ? raw.id : 0,
      name: raw.name || repo,
      fullName,
      owner,
      repo,
      defaultBranch: raw.defaultBranch || raw.default_branch || null,
      private: typeof raw.private === "boolean" ? raw.private : null,
    });
  }

  return out;
}

function pickSelectableSelections(
  repositories: RepositoryOption[],
  selections: ActiveRepoSelection[],
): ActiveRepoSelection[] {
  if (repositories.length === 0) return selections;

  return sortSelectionsByRepositoryOrder(
    selections.filter((selection) =>
      repositories.some(
        (option) => option.owner === selection.owner && option.repo === selection.repo,
      ),
    ),
    repositories,
  );
}

function sortSelectionsByRepositoryOrder(
  selections: ActiveRepoSelection[],
  repositories: RepositoryOption[],
): ActiveRepoSelection[] {
  const order = new Map(repositories.map((repo, index) => [`${repo.owner}/${repo.repo}`.toLowerCase(), index]));
  return selections.slice().sort((left, right) => {
    const leftOrder = order.get(formatActiveRepoLabel(left).toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(formatActiveRepoLabel(right).toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}

function pickOwnerHint(status: GitHubStatusResponse): string | null {
  return status.app?.owner?.login || status.ownerHint || null;
}

function StatusChip({ state }: { state: StatusState }) {
  if (state.kind === "loading") {
    return <span className="rounded-full border border-[#2a3341] bg-[#171d28] px-3 py-1 text-xs text-[#dce6f1]">проверяю</span>;
  }
  if (state.kind === "error") {
    return <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs text-rose-200">ошибка</span>;
  }
  if (!state.configured) {
    return <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">настроить</span>;
  }
  return <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">готово</span>;
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "info" | "error";
  title: string;
  children: ReactNode;
}) {
  const cls =
    tone === "error"
      ? "border border-rose-400/25 bg-rose-400/10 text-rose-100"
      : "border border-[#27303d] bg-[#111722] text-[#d7e0ec]";

  return (
    <div className={`rounded-[16px] px-4 py-3 text-sm ${cls}`}>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
        {title}
      </div>
      <div className="leading-6">{children}</div>
    </div>
  );
}
