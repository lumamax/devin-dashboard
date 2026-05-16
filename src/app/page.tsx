import { listStoredAccounts } from "@/lib/connectionStore";
import { AccountCard } from "@/components/AccountCard";
import { AddAccountWizard } from "@/components/AddAccountWizard";
import { OmniRouteStatus } from "@/components/OmniRouteStatus";
import { RepoBootstrapPanel } from "@/components/RepoBootstrapPanel";
import { PickBestAccountPanel } from "@/components/PickBestAccountPanel";
import type { AccountSummary } from "@/lib/omniroute";

export const dynamic = "force-dynamic";

export default async function Home() {
  let accounts: AccountSummary[] = [];
  let error: string | null = null;

  try {
    const stored = await listStoredAccounts();
    accounts = stored.map((a) => {
      const repoAssignment = readRepoAssignment(a.providerSpecificData);

      return {
        id: a.id,
        name: a.name,
        priority: a.priority,
        testStatus: a.testStatus,
        rateLimitedUntil: a.rateLimitedUntil,
        lastError: a.lastError,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        hasCreds: a.creds !== null,
        orgId: a.creds?.orgId || null,
        bearerPreview: a.creds?.bearer ? `${a.creds.bearer.slice(0, 16)}…` : null,
        assignedRepoFullName: repoAssignment?.fullName || null,
        assignedBranch: repoAssignment?.branch || null,
      };
    });
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : "Unknown error";
  }

  const readyCount = accounts.filter(
    (account) => account.hasCreds && (account.testStatus === "valid" || account.testStatus === "ok"),
  ).length;
  const relinkCount = accounts.filter((account) => !account.hasCreds).length;
  const cooldownCount = accounts.filter((account) => {
    if (!account.rateLimitedUntil) return false;
    const until = new Date(account.rateLimitedUntil).getTime();
    return Number.isFinite(until) && until > Date.now();
  }).length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1880px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-6 2xl:max-w-[2100px] 2xl:px-10">
      <section className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,22,29,0.97),rgba(10,12,18,0.94))] shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6">
          <div className="max-w-3xl">
            <div className="mb-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fa4bd]">
              <span className="rounded-full border border-[#3b4454] bg-white/5 px-3 py-1 text-[#d7e0ec]">
                Devin dashboard
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-200">
                Local OmniRoute
              </span>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[2.2rem]">
              Devin Dashboard
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#9da8b8]">
              Все Devin-аккаунты в одном локальном списке: быстро увидеть квоту, статус и открыть нужную сессию.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[420px] xl:min-w-[480px]">
            <StatCard label="Аккаунты" value={accounts.length} accent="text-white" />
            <StatCard label="Готовы" value={readyCount} accent="text-emerald-300" />
            <StatCard label="Перелинк" value={relinkCount} accent="text-amber-200" />
            <StatCard label="Пауза" value={cooldownCount} accent="text-rose-200" />
          </div>
        </div>
      </section>

      <OmniRouteStatus error={error} />

      <AddAccountWizard />

      <RepoBootstrapPanel />

      <PickBestAccountPanel />

      <section className="overflow-hidden rounded-[24px] border border-white/10 bg-[rgba(11,14,20,0.88)] shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="flex flex-col gap-2 border-b border-white/10 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Аккаунты</h2>
            <p className="mt-1 text-sm text-[#93a0b2]">
              Короткий список аккаунтов: состояние, квота и запуск без лишней служебной информации.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-[#aab5c4]">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {accounts.length} всего
            </span>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-200">
              {readyCount} готовы
            </span>
          </div>
        </div>

        {accounts.length === 0 && !error ? (
          <div className="px-4 py-8 sm:px-5">
            <div className="rounded-[20px] border border-dashed border-white/12 bg-white/[0.03] px-5 py-6 text-sm text-[#98a6b8]">
              Пока нет ни одного Devin-аккаунта. Нажми <b className="text-white">«Добавить аккаунт»</b> или подтяни уже открытые Chrome-сессии.
            </div>
          </div>
        ) : (
          <>
            <div className="hidden border-b border-white/10 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#748399] xl:grid xl:grid-cols-[minmax(280px,1.08fr)_minmax(330px,1fr)_minmax(236px,0.72fr)_180px] xl:gap-4 xl:px-5">
              <span>Аккаунт</span>
              <span>Сессия</span>
              <span>Квота</span>
              <span className="text-right">Действия</span>
            </div>

            <div className="divide-y divide-white/8">
              {accounts.map((account) => (
                <AccountCard key={account.id} account={account} />
              ))}
            </div>
          </>
        )}
      </section>

      <footer className="px-1 pb-3 text-xs text-[#6f7f94]">
        Локальный Devin Dashboard для OmniRoute: добавить аккаунт, увидеть квоту, открыть нужную сессию.
      </footer>
    </main>
  );
}

function readRepoAssignment(providerSpecificData: Record<string, unknown> | null) {
  const dashboard = providerSpecificData?.devinDashboard;
  if (!dashboard || typeof dashboard !== "object" || Array.isArray(dashboard)) {
    return null;
  }

  const repoAssignment = (dashboard as Record<string, unknown>).repoAssignment;
  if (!repoAssignment || typeof repoAssignment !== "object" || Array.isArray(repoAssignment)) {
    return null;
  }

  const record = repoAssignment as Record<string, unknown>;
  const fullName = typeof record.fullName === "string" && record.fullName.trim()
    ? record.fullName.trim()
    : typeof record.owner === "string" && typeof record.repo === "string"
      ? `${record.owner.trim()}/${record.repo.trim()}`
      : null;
  const branch = typeof record.branch === "string" && record.branch.trim() ? record.branch.trim() : null;

  if (!fullName) {
    return null;
  }

  return {
    fullName,
    branch,
  };
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.04] px-3 py-3.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7d8ba0]">
        {label}
      </div>
      <div className={`mt-1.5 text-xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}
