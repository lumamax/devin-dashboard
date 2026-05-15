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
      orgId: string;
      bearerPreview: string;
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
                : `Devin ${json.orgId || "account"}`;
            setName(suggestedName);
            setState({
              status: "captured",
              ticket,
              orgId: json.orgId,
              bearerPreview: json.bearerPreview,
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
    <section className="relative rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,18,25,0.96),rgba(9,12,18,0.92))] shadow-[0_20px_60px_rgba(0,0,0,0.32)] backdrop-blur">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between lg:p-6">
        <div className="min-w-0 max-w-3xl">
          <div className="mb-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8596ad]">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[#dce6f1]">
              Devin dashboard
            </span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-200">
              Автоподхват сессии
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-white sm:text-[1.2rem]">Добавить аккаунт</h2>
            <details className="group relative">
              <summary className="list-none cursor-pointer rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-[#d7e2ef] transition hover:bg-white/[0.08]">
                Как это работает
              </summary>
              <div className="mt-3 w-full rounded-[20px] border border-white/10 bg-[#0d131b]/95 p-4 text-sm text-[#c7d3e0] shadow-[0_22px_50px_rgba(0,0,0,0.45)] lg:absolute lg:left-0 lg:top-full lg:z-20 lg:mt-2 lg:w-[420px]">
                <div className="space-y-2 leading-6">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                    1. Нажми «Добавить аккаунт» и войди в Devin в новом окне Chrome.
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                    2. После логина сессия сама сохранится в локальный список.
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                    3. Если Devin уже открыт в обычном Chrome, можно просто нажать «Импорт из Chrome».
                  </div>
                </div>
              </div>
            </details>
          </div>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#95a3b6]">
            Быстрый вход через чистое окно или импорт уже открытых Devin-сессий из Chrome.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
          {state.status === "idle" ||
          state.status === "error" ||
          state.status === "done" ||
          state.status === "imported" ? (
            <>
              <button
                type="button"
                onClick={importFromChrome}
                className="inline-flex min-w-[178px] items-center justify-center rounded-full border border-white/12 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-[#eef4fb]"
              >
                Импорт из Chrome
              </button>
              <button
                type="button"
                onClick={start}
                className="inline-flex min-w-[196px] items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
              >
                {state.status === "done" ? "Добавить ещё" : "Добавить аккаунт"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-w-[164px] items-center justify-center rounded-full border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-[#e5edf8] transition hover:bg-white/[0.08]"
            >
              Отмена
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-white/8 px-5 py-4 lg:px-6">
        <Body state={state} />
      </div>
    </section>
  );
}

function Body({ state }: { state: CaptureStatus }) {
  if (state.status === "idle") {
    return (
      <div className="rounded-[18px] border border-dashed border-white/12 bg-white/[0.03] px-4 py-3 text-sm text-[#94a4b7]">
        Новый вход откроет отдельное окно Chrome. Импорт просто подтянет уже активные Devin-сессии.
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
        Окно Chrome уже открыто. Войди в Devin, и после успешного логина аккаунт сам появится в списке.
      </Note>
    );
  }
  if (state.status === "captured") {
    return <Note tone="ok" title="Сессию поймал">Всё хорошо, сохраняю аккаунт в локальный список.</Note>;
  }
  if (state.status === "saving") {
    return <Note tone="info" title="Сохраняю аккаунт">Добавляю «{state.name}» в дашборд…</Note>;
  }
  if (state.status === "done") {
    return <Note tone="ok" title="Готово">Аккаунт сохранён и уже доступен в списке ниже.</Note>;
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
        : "border border-white/10 bg-black/15 text-[#d7e0ec]";

  return (
    <div className={`rounded-[18px] px-4 py-3 text-sm ${cls}`}>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
        {title}
      </div>
      <div className="leading-6">{children}</div>
    </div>
  );
}
