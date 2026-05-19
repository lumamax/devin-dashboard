import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

async function withTempLocalStore<T>(body: (storePath: string) => Promise<T>): Promise<T> {
  const previousStore = process.env.DEVIN_DASHBOARD_STORE;
  const previousStorePath = process.env.DEVIN_DASHBOARD_STORE_PATH;
  const previousHome = process.env.DEVIN_DASHBOARD_HOME;
  const tempDir = mkdtempSync(path.join(tmpdir(), "devin-dashboard-store-"));
  const storePath = path.join(tempDir, "dashboard.json");

  process.env.DEVIN_DASHBOARD_STORE = "local";
  process.env.DEVIN_DASHBOARD_STORE_PATH = storePath;
  delete process.env.DEVIN_DASHBOARD_HOME;

  try {
    return await body(storePath);
  } finally {
    restoreEnv("DEVIN_DASHBOARD_STORE", previousStore);
    restoreEnv("DEVIN_DASHBOARD_STORE_PATH", previousStorePath);
    restoreEnv("DEVIN_DASHBOARD_HOME", previousHome);
    rmSync(tempDir, { recursive: true, force: true });
  }
}

test("local store saves and lists Devin accounts without OmniRoute", async () => {
  const mod = await import("../src/lib/connectionStore.ts");

  await withTempLocalStore(async (storePath) => {
    delete process.env.OMNIROUTE_TOKEN;
    const saved = await mod.saveAccount({
      name: "Local Devin",
      creds: {
        cookie: "wos-session=local",
        bearer: "auth1_local-token",
        orgId: "org-local",
      },
      providerSpecificData: {
        devinDashboard: {
          repoAssignment: {
            owner: "lumamax",
            repo: "devin-dashboard",
            branch: "main",
            fullName: "lumamax/devin-dashboard",
          },
        },
      },
    });

    assert.ok(saved.id);
    assert.equal(existsSync(storePath), true);

    const accounts = await mod.listStoredAccounts();
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0]?.name, "Local Devin");
    assert.equal(accounts[0]?.creds?.orgId, "org-local");
    assert.equal(
      accounts[0]?.providerSpecificData?.devinDashboard instanceof Object,
      true,
    );

    const rawStore = JSON.parse(readFileSync(storePath, "utf8")) as {
      accounts: Array<{ rawApiKey?: string }>;
    };
    assert.match(rawStore.accounts[0]?.rawApiKey || "", /devin-web-creds/);
  });
});

test("local store updates credentials and preserves account id", async () => {
  const mod = await import("../src/lib/connectionStore.ts");

  await withTempLocalStore(async () => {
    const saved = await mod.saveAccount({
      name: "Refresh Devin",
      creds: { cookie: "old", bearer: "old-bearer", orgId: "org-refresh" },
    });

    await mod.updateAccountCreds(
      saved.id,
      { cookie: "new", bearer: "new-bearer", orgId: "org-refresh" },
      { devinDashboard: { preparedRepos: [] } },
    );

    const account = await mod.getStoredAccount(saved.id);
    assert.equal(account?.id, saved.id);
    assert.equal(account?.creds?.bearer, "new-bearer");
    assert.deepEqual(account?.providerSpecificData, {
      devinDashboard: { preparedRepos: [] },
    });
  });
});

test("local store can rename during relink and delete accounts", async () => {
  const mod = await import("../src/lib/connectionStore.ts");

  await withTempLocalStore(async () => {
    const saved = await mod.saveAccount({
      name: "Old Devin",
      creds: { cookie: "old", bearer: "old-bearer", orgId: "org-old" },
    });

    await mod.updateAccountCreds(
      saved.id,
      { cookie: "new", bearer: "new-bearer", orgId: "org-new" },
      { devinDashboard: { userDataDir: "/tmp/devin-dashboard-profile" } },
      { name: "New Devin" },
    );

    const renamed = await mod.getStoredAccount(saved.id);
    assert.equal(renamed?.name, "New Devin");
    assert.equal(renamed?.creds?.orgId, "org-new");

    assert.equal(await mod.deleteStoredAccount(saved.id), true);
    assert.equal(await mod.getStoredAccount(saved.id), null);
    assert.equal(await mod.deleteStoredAccount(saved.id), false);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
