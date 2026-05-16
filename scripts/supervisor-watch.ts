import {
  runSupervisorLoop,
  runSupervisorTick,
  resolveSupervisorPaths,
} from "../src/lib/supervisorWatcher";

const args = process.argv.slice(2);
const once = args.includes("--once");
const dryRun = args.includes("--dry-run");
const json = args.includes("--json");
const verbose = args.includes("--verbose");
const intervalMs = parseInterval(args);

const options = {
  dryRun,
  paths: resolveSupervisorPaths(),
};

if (once) {
  const result = await runSupervisorTick(options);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHumanResult(result, true, verbose);
  }
  process.exit(0);
}

console.log(`[${new Date().toISOString()}] Devin supervisor watcher started (${dryRun ? "dry-run" : "live"}, interval ${Math.round(intervalMs / 1000)}s)`);
await runSupervisorLoop({ ...options, intervalMs });

function parseInterval(input: string[]): number {
  const index = input.findIndex((item) => item === "--interval-ms");
  if (index >= 0) {
    const value = Number(input[index + 1]);
    if (Number.isFinite(value) && value >= 30_000) return value;
  }

  const shortIndex = input.findIndex((item) => item === "--interval");
  if (shortIndex >= 0) {
    const value = Number(input[shortIndex + 1]);
    if (Number.isFinite(value) && value >= 30) return value * 1000;
  }

  return 3 * 60 * 1000;
}

function printHumanResult(
  result: Awaited<ReturnType<typeof runSupervisorTick>>,
  forceSummary: boolean,
  verboseOutput: boolean,
) {
  if (result.interesting.length === 0 && !forceSummary && !verboseOutput) {
    return;
  }

  if (result.interesting.length > 0) {
    for (const line of result.interesting) {
      console.log(`[${result.ranAt}] ${line}`);
    }
    return;
  }

  const summary = result.accounts.map((account) => {
    const repo = account.repoFullName || "unassigned";
    const quota = account.effectiveRemaining === null ? "n/a" : `${Math.round(account.effectiveRemaining)}%`;
    return `${account.name}: ${account.band} (${quota}) on ${repo}`;
  }).join(" | ");
  console.log(`[${result.ranAt}] ${summary}`);
}
