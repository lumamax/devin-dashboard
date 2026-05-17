"use client";

import { startTransition, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type CaptureStatus =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "importing" }
  | { status: "pending"; ticket: string; chromePort: number }
  | {
      status: "captured";
      ticket: string;
      suggestedName: string;
    }
  | { status: "saving"; ticket: string; name: string }
  | { status: "done"; id: string }
  | { status: "imported"; message: string }
  | { status: "error"; error: string };

const POLL_INTERVAL_MS = 1500;

export function AddAccountWizard() {
  const [state, setState] = useState<CaptureStatus>({ status: "idle" });
  const [name, setName] = useState("");
  const router = useRouter();
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  const pollStatus = useCallback(
    (ticket: string, port: number) => {
      const autoSave = async (suggestedName: string) => {
        setState({ status: "saving", ticket, name: suggestedName });
        try {
          const res = await fetch(`/api/accounts/add/${encodeURIComponent(ticket)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: suggestedName }),
          });
          const json = await res.json();
          if (!res.ok || !json.ok) {
            throw new Error(json.error || `HTTP ${res.status}`);
          }
          setState({ status: "done", id: json.id });
          setName("");
          startTransition(() => {
            router.refresh();
          });
        } catch (err) {
          setState({
            status: "error",
            error: err instanceof Error ? err.message : "Auto-save failed",
          });
        }
      };

      const tick = async () => {
        try {
          const res = await fetch(`/api/accounts/add/${encodeURIComponent(ticket)}`, {
            cache: "no-store",
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

          if (json.status === "captured") {
            const suggestedName =
              typeof json.suggestedName === "string" && json.suggestedName.trim()
                ? json.suggestedName.trim()
                : "Devin account";
            setName(suggestedName);
            setState({
              status: "captured",
              ticket,
              suggestedName,
            });
            void autoSave(suggestedName);
            return;
          }

          if (json.status === "error") {
            setState({ status: "error", error: json.error || "Capture failed" });
            return;
          }

          if (json.status === "expired") {
            setState({
              status: "error",
              error: "Вход не завершился за 10 минут. Нажми «Добавить аккаунт» и попробуй ещё раз.",
            });
            return;
          }

          pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
        } catch (err) {
          setState({
            status: "error",
            error: err instanceof Error ? err.message : "Poll error",
          });
        }
      };

      pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
      setState({ status: "pending", ticket, chromePort: port });
    },
    [router],
  );

  async function start() {
    setState({ status: "starting" });
    try {
      const res = await fetch("/api/accounts/add", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      pollStatus(json.ticket, json.chromePort);
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to start capture",
      });
    }
  }

  async function importFromChrome() {
    setState({ status: "importing" });
    try {
      const res = await fetch("/api/accounts/import-chrome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const importedCount = Array.isArray(json.imported) ? json.imported.length : 0;
      const skippedCount = Array.isArray(json.skipped) ? json.skipped.length : 0;
      setState({
        status: "imported",
        message: `Добавлено ${importedCount} аккаунт(ов)${skippedCount > 0 ? `, пропущено ${skippedCount}` : ""}.`,
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : "Import failed",
      });
    }
  }

  function reset() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setState({ status: "idle" });
    setName("");
  }

  return (
    <section className="relative overflow-hidden rounded-[20px] border border-[#1e2734] bg-[linear-gradient(180deg,rgba(13,17,24,0.98),rgba(8,11,17,0.94))] shadow-[0_18px_46px_rgba(0,0,0,0.32)] backdrop-blur">
      <div className="p-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8596ad]">
            <span className="rounded-full border border-[#2a3341] bg-[#171d28] px-3 py-1 text-[#dce6f1]">
              Аккаунты
            </span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-200">
              Chrome
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Добавить Devin</h2>
              <p className="mt-1 text-sm leading-6 text-[#95a3b6]">Новое окно или быстрый импорт.</p>
            </div>
            <details className="group w-full sm:w-auto">
              <summary className="list-none cursor-pointer rounded-full border border-[#2a3341] bg-[#171d28] px-3 py-1.5 text-xs font-semibold text-[#d7e2ef] transition hover:bg-[#1c2330]">
                Как это работает
              </summary>
              <div className="mt-3 rounded-[16px] border border-[#26303d] bg-[#111722] p-3 text-sm text-[#c7d3e0] shadow-[0_18px_40px_rgba(0,0,0,0.35)] sm:w-[360px]">
                <div className="space-y-2 leading-6 text-[#c7d3e0]">
                  <div>1. Открой новый вход через «Добавить Devin».</div>
                  <div>2. После логина аккаунт сам появится в списке.</div>
                  <div>3. Если Devin уже открыт, используй импорт из Chrome.</div>
                </div>
              </div>
            </details>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {state.status === "idle" ||
          state.status === "error" ||
          state.status === "done" ||
          state.status === "imported" ? (
            <>
              <button
                type="button"
                onClick={importFromChrome}
                className="inline-flex min-h-[54px] items-center justify-center rounded-[16px] border border-[#2f3947] bg-[#1c2430] px-4 py-3 text-base font-semibold text-[#eef4fb] transition hover:bg-[#232c3a]"
              >
                Импорт из Chrome
              </button>
              <button
                type="button"
                onClick={start}
                className="inline-flex min-h-[56px] items-center justify-center rounded-[16px] border border-emerald-400/20 bg-emerald-400 px-4 py-3 text-base font-semibold text-slate-950 transition hover:bg-emerald-300"
              >
                {state.status === "done" ? "Добавить ещё" : "Добавить Devin"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-[54px] items-center justify-center rounded-[16px] border border-[#2a3340] bg-[#171d28] px-4 py-3 text-base font-semibold text-[#e5edf8] transition hover:bg-[#1d2431]"
            >
              Отмена
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-white/6 px-4 py-3.5">
        <Body state={state} />
      </div>
    </section>
  );
}

function Body({ state }: { state: CaptureStatus }) {
  if (state.status === "idle") {
    return (
      <div className="rounded-[16px] border border-dashed border-[#27303d] bg-[#111722] px-4 py-3 text-sm text-[#94a4b7]">
        Импорт подтянет уже открытые Devin-сессии. Новый вход откроет отдельное окно Chrome.
      </div>
    );
  }
  if (state.status === "starting") {
    return <Note tone="info" title="Открываю Chrome">Готовлю чистое окно для входа в Devin…</Note>;
  }
  if (state.status === "importing") {
    return <Note tone="info" title="Сканирую Chrome">Ищу уже залогиненные Devin-сессии…</Note>;
  }
  if (state.status === "pending") {
    return (
      <Note tone="info" title="Жду вход">
        Окно уже открыто. Войди в Devin, и аккаунт сам появится в списке.
      </Note>
    );
  }
  if (state.status === "captured") {
    return <Note tone="ok" title="Сессию поймал">Сохраняю аккаунт в локальный список.</Note>;
  }
  if (state.status === "saving") {
    return <Note tone="info" title="Сохраняю аккаунт">Добавляю «{state.name}» в дашборд…</Note>;
  }
  if (state.status === "done") {
    return <Note tone="ok" title="Готово">Аккаунт уже доступен в списке.</Note>;
  }
  if (state.status === "imported") {
    return <Note tone="ok" title="Импорт завершён">{state.message}</Note>;
  }
  if (state.status === "error") {
    return <Note tone="error" title="Что-то пошло не так">{state.error}</Note>;
  }
  return null;
}

function Note({
  tone,
  title,
  children,
}: {
  tone: "info" | "ok" | "error";
  title: string;
  children: ReactNode;
}) {
  const cls =
    tone === "error"
      ? "border border-rose-400/25 bg-rose-400/10 text-rose-100"
      : tone === "ok"
        ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
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
