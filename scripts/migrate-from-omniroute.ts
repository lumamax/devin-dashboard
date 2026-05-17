import { replaceLocalStoredAccounts } from "../src/lib/dashboardStore";
import { listStoredAccounts } from "../src/lib/connectionStore";

async function main() {
  const previousStore = process.env.DEVIN_DASHBOARD_STORE;
  process.env.DEVIN_DASHBOARD_STORE = "omniroute";

  const accounts = await listStoredAccounts();
  replaceLocalStoredAccounts(accounts);

  if (previousStore === undefined) {
    delete process.env.DEVIN_DASHBOARD_STORE;
  } else {
    process.env.DEVIN_DASHBOARD_STORE = previousStore;
  }

  console.log(`Migrated ${accounts.length} Devin account(s) into the local dashboard store.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
