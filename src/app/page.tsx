import { AccountCard } from "@/components/AccountCard";
import { AddAccountWizard } from "@/components/AddAccountWizard";
import { OmniRouteStatus } from "@/components/OmniRouteStatus";
import { RepoBootstrapPanel } from "@/components/RepoBootstrapPanel";
import { orderStoredAccountsByHealth } from "@/lib/accountOrdering";
import { listStoredAccounts } from "@/lib/connectionStore";
import { readPreparedRepos, readRepoAssignment } from "@/lib/dashboardRepoState";
import type { AccountSummary } from "@/lib/omniroute";

export const dynamic = "force-dynamic";

export default async function Home() {
  let accounts: AccountSummary[] = [];
  let error: string | null = null;

  try {
    const stored = await listStoredAccounts();
    const ordered = await orderStoredAccountsByHealth(stored).catch(() => stored);
    accounts = ordered.map((account) => {
      const repoAssignment = readRepoAssignment(account.providerSpecificData);
      const preparedRepos = readPreparedRepos(account.providerSpecificData).map((repo) => ({
        fullName: repo.repoFullName,
        branch: repo.branch,
        sessionId: repo.sessionId,
        updatedAt: repo.updatedAt,
      }));

      return {
        id: account.id,
        name: account.name,
        priority: account.priority,
        testStatus: account.testStatus,
        rateLimitedUntil: account.rateLimitedUntil,
        lastError: account.lastError,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        hasCreds: account.creds !== null,
        orgId: account.creds?.orgId || null,
        bearerPreview: account.creds?.bearer ? `${account.creds.bearer.slice(0, 16)}…` : null,
        assignedRepoFullName: repoAssignment?.fullName || null,
        assignedBranch: repoAssignment?.branch || null,
        preparedRepos,
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
    <main className="mx-auto flex min-h-screen w-full max-w-[2280px] flex-col gap-4 px-4 py-4 sm:px-6 xl:px-8 2xl:px-10">
      <section className="overflow-hidden rounded-[22px] border border-[#1b2330] bg-[linear-gradient(180deg,rgba(13,17,24,0.98),rgba(8,11,17,0.94))] shadow-[0_22px_64px_rgba(0,0,0,0.38)] backdrop-blur">
        <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-5 lg:py-4">
          <div className="min-w-0 max-w-3xl">
            <div className="mb-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8fa4bd]">
              <span className="rounded-full border border-[#2a3341] bg-[#171d28] px-3 py-1 text-[#d7e0ec]">
                Devin Dashboard
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-200">
                Local OmniRoute
              </span>
            </div>

            <h1 className="text-[1.9rem] font-semibold tracking-tight text-white sm:text-[2.05rem]">
              Devin Dashboard
            </h1>

            <p className="mt-1 text-sm leading-6 text-[#8fa0b5]">
              Квоты, готовые repo и быстрый старт по Devin-аккаунтам.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[360px] xl:min-w-[420px]">
            <StatCard label="Аккаунты" value={accounts.length} accent="text-white" />
            <StatCard label="Готовы" value={readyCount} accent="text-emerald-300" />
            <StatCard label="Перелинк" value={relinkCount} accent="text-amber-200" />
            <StatCard label="Пауза" value={cooldownCount} accent="text-rose-200" />
          </div>
        </div>
      </section>

      <OmniRouteStatus error={error} />

      <section className="grid gap-4 xl:grid-cols-[296px_minmax(0,1fr)] xl:items-start">
        <aside className="xl:sticky xl:top-4">
          <div className="space-y-4">
            <AddAccountWizard />
            <RepoBootstrapPanel />
          </div>
        </aside>

        <section className="overflow-hidden rounded-[22px] border border-[#1b2330] bg-[rgba(10,13,19,0.92)] shadow-[0_24px_60px_rgba(0,0,0,0.34)] backdrop-blur">
          <div className="flex flex-col gap-3 border-b border-white/8 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Аккаунты</h2>
              <p className="mt-1 text-sm text-[#8c9caf]">
                Сначала живые квоты, ниже exhausted и проблемные.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-[#aab5c4]">
              <span className="rounded-full border border-[#27303d] bg-[#161c27] px-3 py-1">
                {accounts.length} всего
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-emerald-200">
                {readyCount} готовы
              </span>
            </div>
          </div>

          {accounts.length === 0 && !error ? (
            <div className="px-4 py-8 sm:px-5">
              <div className="rounded-[18px] border border-dashed border-[#27303d] bg-[#111722] px-5 py-6 text-sm text-[#98a6b8]">
                Пока нет ни одного Devin-аккаунта. Добавь новый вход или подтяни уже открытые Chrome-сессии.
              </div>
            </div>
          ) : (
            <div className="grid gap-4 p-4 sm:p-5 min-[1480px]:grid-cols-2 min-[2180px]:grid-cols-3">
              {accounts.map((account) => (
                <AccountCard key={account.id} account={account} />
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
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
    <div className="rounded-[14px] border border-[#27303d] bg-[#161c27] px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#74859c]">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${accent}`}>{value}</div>
    </div>
  );
}
