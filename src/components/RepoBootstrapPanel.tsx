"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  getActiveRepoSelection,
  saveActiveRepoSelection,
  type ActiveRepoSelection,
} from "@/lib/activeRepo";
import { buildCloudAgentPrompt } from "@/lib/bootstrapPrompt";

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

type BootstrapResponse = {
  ok: boolean;
  error?: string;
  prompt?: string;
  bootstrap?: {
    owner: string;
    repo: string;
    branch: string;
    cloneUrl: string;
    expiresAt: string;
    commands: string[];
  };
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

type BootstrapState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; error: string }
  | {
      kind: "ready";
      owner: string;
      repo: string;
      branch: string;
      cloneUrl: string;
      expiresAt: string;
      commands: string[];
      prompt: string;
    };

export function RepoBootstrapPanel() {
  const [status, setStatus] = useState<StatusState>({ kind: "loading" });
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [bootstrap, setBootstrap] = useState<BootstrapState>({ kind: "idle" });
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    const selection = normalizeSelection(owner, repo, branch);
    if (selection) {
      saveActiveRepoSelection(selection);
    }
  }, [owner, repo, branch]);

  async function loadStatus() {
    setStatus({ kind: "loading" });
    try {
      const res = await fetch("/api/github-app/status", { cache: "no-store" });
      const json = (await res.json()) as GitHubStatusResponse;
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      const repositories = normalizeRepositories(json.repositories);
      const ownerHint = pickOwnerHint(json);
      const firstRepo = repositories[0] || null;
      const currentSelection = normalizeSelection(owner, repo, branch);
      const savedSelection = getActiveRepoSelection();
      const fallbackSelection = normalizeSelection(
        firstRepo?.owner || ownerHint || "lumamax",
        firstRepo?.repo || "devin-dashboard",
        firstRepo?.defaultBranch || "main",
      );
      const nextSelection = currentSelection || savedSelection || fallbackSelection;

      setStatus({
        kind: "ready",
        configured: Boolean(json.configured),
        ownerHint,
        appSlug: json.app?.slug || null,
        repositories,
        missing: json.missing || [],
        error: json.error || null,
      });

      if (nextSelection) {
        setOwner(nextSelection.owner);
        setRepo(nextSelection.repo);
        setBranch(nextSelection.branch);
        saveActiveRepoSelection(nextSelection);
      }
    } catch (err) {
      setStatus({
        kind: "error",
        error: err instanceof Error ? err.message : "Не удалось получить статус GitHub App",
      });
    }
  }

  async function handleBootstrap() {
    const trimmedOwner = owner.trim();
    const trimmedRepo = repo.trim();
    const trimmedBranch = branch.trim() || "main";

    if (!trimmedOwner || !trimmedRepo) {
      setBootstrap({ kind: "error", error: "Заполни owner и repo." });
      return;
    }

    setBootstrap({ kind: "loading" });
    try {
      const res = await fetch("/api/github-app/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: trimmedOwner,
          repo: trimmedRepo,
          branch: trimmedBranch,
        }),
      });
      const json = (await res.json()) as BootstrapResponse;
      if (!res.ok || !json.ok || !json.bootstrap) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setBootstrap({
        kind: "ready",
        owner: json.bootstrap.owner,
        repo: json.bootstrap.repo,
        branch: json.bootstrap.branch,
        cloneUrl: json.bootstrap.cloneUrl,
        expiresAt: json.bootstrap.expiresAt,
        commands: json.bootstrap.commands,
        prompt: json.prompt || buildCloudAgentPrompt(json.bootstrap),
      });
    } catch (err) {
      setBootstrap({
        kind: "error",
        error: err instanceof Error ? err.message : "Не удалось подготовить доступ",
      });
    }
  }

  async function copyText(kind: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => {
        setCopied((current) => (current === kind ? null : current));
      }, 1600);
    } catch (err) {
      setBootstrap({
        kind: "error",
        error: err instanceof Error ? err.message : "Не удалось скопировать текст",
      });
    }
  }

  function selectRepository(option: RepositoryOption) {
    setOwner(option.owner);
    setRepo(option.repo);
    setBranch(option.defaultBranch || "main");
    setBootstrap({ kind: "idle" });
  }

  return (
    <section
      id="repo-bootstrap"
      className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,20,28,0.95),rgba(9,12,19,0.92))] shadow-[0_22px_60px_rgba(0,0,0,0.34)] backdrop-blur"
    >
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between lg:p-6">
        <div className="max-w-3xl">
          <div className="mb-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8596ad]">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[#dce6f1]">
              Рабочее репо
            </span>
            <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-sky-100">
              GitHub App bootstrap
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-white sm:text-[1.2rem]">Подключить Devin к приватному репо</h2>
            <StatusChip state={status} />
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#95a3b6]">
            Выбери общее рабочее репо один раз, а потом запускай конкретный Devin-аккаунт ниже уже с готовым seed prompt. Старые GitHub-сессии переносить не нужно.
          </p>

          <p className="mt-2 text-xs leading-5 text-[#7f91a8]">
            Это активное репо используют кнопки <b className="text-[#dce6f1]">«Открыть + репо»</b> у аккаунтов ниже.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadStatus()}
          className="inline-flex min-w-[148px] items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-[#e6eef8] transition hover:bg-white/[0.08]"
        >
          Обновить
        </button>
      </div>

      <div className="border-t border-white/8 px-5 py-4 lg:px-6">
        {status.kind === "loading" ? (
          <Notice tone="info" title="Проверяю GitHub App">
            Смотрю, какие приватные репозитории уже доступны через локальный control plane.
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
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.95fr)]">
              <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7990ab]">
                  <span>Доступные репозитории</span>
                  {status.appSlug ? (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 normal-case tracking-normal text-[#d7e3f0]">
                      {status.appSlug}
                    </span>
                  ) : null}
                </div>

                {status.repositories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {status.repositories.map((option) => {
                      const active = option.owner === owner.trim() && option.repo === repo.trim();
                      return (
                        <button
                          key={option.id || option.fullName}
                          type="button"
                          onClick={() => selectRepository(option)}
                          className={`rounded-full border px-3 py-2 text-sm transition ${
                            active
                              ? "border-emerald-400/25 bg-emerald-400/12 text-emerald-100"
                              : "border-white/10 bg-white/[0.04] text-[#d6e0ed] hover:bg-white/[0.08]"
                          }`}
                        >
                          {option.fullName}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[16px] border border-dashed border-white/10 bg-black/15 px-4 py-3 text-sm text-[#8fa0b5]">
                    В списке пока пусто, но owner и repo можно вписать вручную.
                  </div>
                )}
              </div>

              <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7990ab]">
                  Подготовить доступ
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1.5 text-sm text-[#dce6f2]">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-[#7f91a8]">Owner</span>
                    <input
                      value={owner}
                      onChange={(event) => setOwner(event.target.value)}
                      className="w-full rounded-[14px] border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/30"
                      placeholder="lumamax"
                    />
                  </label>
                  <label className="space-y-1.5 text-sm text-[#dce6f2]">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-[#7f91a8]">Repo</span>
                    <input
                      value={repo}
                      onChange={(event) => setRepo(event.target.value)}
                      className="w-full rounded-[14px] border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/30"
                      placeholder="devin-dashboard"
                    />
                  </label>
                  <label className="space-y-1.5 text-sm text-[#dce6f2]">
                    <span className="text-[11px] uppercase tracking-[0.16em] text-[#7f91a8]">Branch</span>
                    <input
                      value={branch}
                      onChange={(event) => setBranch(event.target.value)}
                      className="w-full rounded-[14px] border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/30"
                      placeholder="main"
                    />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#8193aa]">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 uppercase tracking-[0.14em] text-[#7f91a8]">
                    Активное репо
                  </span>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 font-mono text-emerald-100">
                    {owner.trim() || "owner"}/{repo.trim() || "repo"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[#d6e0ed]">
                    {branch.trim() || "main"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBootstrap}
                    disabled={bootstrap.kind === "loading"}
                    className="inline-flex min-w-[188px] items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {bootstrap.kind === "loading" ? "Готовлю…" : "Подготовить для Devin"}
                  </button>
                  <span className="text-xs leading-5 text-[#8193aa]">
                    На выходе будет короткоживущий git-доступ именно под это репо.
                  </span>
                </div>
              </div>
            </div>

            {status.error ? (
              <Notice tone="info" title="Подсказка">
                {status.error}
              </Notice>
            ) : null}

            {bootstrap.kind === "error" ? (
              <Notice tone="error" title="Не получилось подготовить доступ">
                {bootstrap.error}
              </Notice>
            ) : null}

            {bootstrap.kind === "ready" ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <div className="space-y-4 rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.025))] p-4">
                  <div className="flex flex-wrap gap-2 text-xs text-[#dbe6f2]">
                    <MetaPill label="repo" value={`${bootstrap.owner}/${bootstrap.repo}`} />
                    <MetaPill label="branch" value={bootstrap.branch} />
                    <MetaPill label="expires" value={formatExpiry(bootstrap.expiresAt)} />
                  </div>

                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7990ab]">
                      Git-команды
                    </div>
                    <pre className="overflow-x-auto rounded-[16px] border border-white/10 bg-[#0b1118] px-4 py-3 text-[12px] leading-6 text-[#dbe7f3]">
                      {bootstrap.commands.join("\n")}
                    </pre>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <CopyButton
                      label={copied === "commands" ? "Скопировано" : "Скопировать команды"}
                      onClick={() => void copyText("commands", bootstrap.commands.join("\n"))}
                    />
                    <CopyButton
                      label={copied === "clone" ? "Скопировано" : "Скопировать clone"}
                      onClick={() => void copyText("clone", bootstrap.cloneUrl)}
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7990ab]">
                        Prompt для нового Devin
                      </div>
                      <p className="mt-1 text-sm text-[#91a2b8]">
                        Это уже можно целиком вставлять в новую cloud-сессию.
                      </p>
                    </div>
                    <CopyButton
                      label={copied === "prompt" ? "Скопировано" : "Скопировать prompt"}
                      onClick={() => void copyText("prompt", bootstrap.prompt)}
                    />
                  </div>

                  <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-[16px] border border-white/10 bg-[#0b1118] px-4 py-3 text-[12px] leading-6 text-[#dbe7f3]">
                    {bootstrap.prompt}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
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

function normalizeSelection(
  owner: string | null | undefined,
  repo: string | null | undefined,
  branch: string | null | undefined,
): ActiveRepoSelection | null {
  const trimmedOwner = owner?.trim() || "";
  const trimmedRepo = repo?.trim() || "";
  const trimmedBranch = branch?.trim() || "main";

  if (!trimmedOwner || !trimmedRepo) {
    return null;
  }

  return {
    owner: trimmedOwner,
    repo: trimmedRepo,
    branch: trimmedBranch,
  };
}

function pickOwnerHint(status: GitHubStatusResponse): string | null {
  return status.app?.owner?.login || status.ownerHint || null;
}

function formatExpiry(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusChip({ state }: { state: StatusState }) {
  if (state.kind === "loading") {
    return <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-[#dce6f1]">проверяю</span>;
  }
  if (state.kind === "error") {
    return <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs text-rose-200">ошибка</span>;
  }
  if (!state.configured) {
    return <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">нужно настроить</span>;
  }
  return <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">готово</span>;
}

function CopyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-[#e6eef8] transition hover:bg-white/[0.08]"
    >
      {label}
    </button>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px]">
      <span className="mr-1.5 text-[#70839b]">{label}</span>
      <span className="text-[#e8f0fa]">{value}</span>
    </span>
  );
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
      : "border border-white/10 bg-black/15 text-[#d7e0ec]";

  return (
    <div className={`rounded-[18px] px-4 py-3 text-sm ${cls}`}>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{title}</div>
      <div className="leading-6">{children}</div>
    </div>
  );
}
