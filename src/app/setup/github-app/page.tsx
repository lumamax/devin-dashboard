import Link from "next/link";
import { getGitHubAppStatus } from "@/lib/githubApp";

export const dynamic = "force-dynamic";

export default function GitHubAppSetupPage() {
  const status = getGitHubAppStatus();

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-6 text-[#d9e4f0] sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
            GitHub App broker
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Настройка доступа к repo</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#93a4b8]">
            GitHub App остаётся локальным брокером: dashboard mint-ит короткоживущие installation tokens,
            а Devin получает только одноразовую команду clone для выбранного репозитория.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full border border-[#293443] bg-[#151c27] px-4 py-2 text-sm font-semibold text-[#edf4fb] transition hover:bg-[#1d2532]"
        >
          Назад
        </Link>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <SetupCard title="1. Создай GitHub App">
            <p>
              Открой GitHub Developer settings, создай новый GitHub App и выбери установку только на нужные
              репозитории. Callback и webhook URL для локального MVP не обязательны.
            </p>
            <a
              href="https://github.com/settings/apps/new"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex rounded-full border border-emerald-400/20 bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              Создать GitHub App
            </a>
          </SetupCard>

          <SetupCard title="2. Выдай минимальные права">
            <ul className="space-y-2">
              <li><b>Repository metadata:</b> read</li>
              <li><b>Contents:</b> read/write для clone, commit и push рабочих веток</li>
              <li><b>Pull requests:</b> read/write, если агенты должны открывать PR</li>
            </ul>
          </SetupCard>

          <SetupCard title="3. Установи App на репозитории">
            <p>
              После создания установи App в свой GitHub account или organization и выбери репозитории, которые
              можно прошивать в Devin. Лучше начинать с одного приватного repo и расширять список постепенно.
            </p>
          </SetupCard>

          <SetupCard title="4. Сохрани локальные env">
            <p>Секреты должны жить только в локальном `.env.local`. Не отправляй private key в Devin и не коммить его.</p>
            <pre className="mt-3 overflow-x-auto rounded-[16px] border border-[#263140] bg-[#090d14] p-4 text-xs leading-6 text-[#d8e4f1]">
{`GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\n...\\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_INSTALLATION_ID=987654
GITHUB_APP_OWNER=your-org-or-user`}
            </pre>
          </SetupCard>

          <SetupCard title="5. Проверь dashboard">
            <p>
              Вернись на главную, нажми «Обновить» в блоке репозиториев и выбери repo. Если всё настроено,
              список репозиториев подтянется из GitHub App installation.
            </p>
          </SetupCard>
        </div>

        <aside className="h-fit rounded-[22px] border border-[#1f2937] bg-[#101721] p-4 shadow-[0_18px_46px_rgba(0,0,0,0.26)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8092a8]">Локальный статус</div>
          <div className="mt-3 rounded-[16px] border border-[#263140] bg-[#0c1119] p-3">
            <div className="text-sm font-semibold text-white">
              {status.configured ? "GitHub App готов" : "Нужно настроить"}
            </div>
            {status.missing.length > 0 ? (
              <div className="mt-2 text-sm leading-6 text-amber-100">
                Не хватает: {status.missing.join(", ")}
              </div>
            ) : null}
          </div>
          <div className="mt-4 space-y-2 text-sm leading-6 text-[#93a4b8]">
            <p>Private key остаётся у локального supervisor.</p>
            <p>Devin получает короткий installation token только внутри clone URL.</p>
            <p>При переносе проекта другому пользователю он создаёт свою App и свои env.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}

function SetupCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] border border-[#1f2937] bg-[linear-gradient(180deg,rgba(17,24,35,0.98),rgba(10,14,21,0.96))] p-5 shadow-[0_18px_46px_rgba(0,0,0,0.24)]">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-3 text-sm leading-6 text-[#a7b6c8]">{children}</div>
    </section>
  );
}
