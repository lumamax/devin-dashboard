import { strict as assert } from "node:assert";
import { test } from "node:test";

test("scoreAccount gives highest score to active account with full quota and matching repo", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-1",
      name: "Best Account",
      quota: { dailyPercentage: 100, weeklyPercentage: 100 },
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
      repo: { assignedRepoFullName: "lumamax/devin-dashboard", assignedBranch: "main" },
    },
    { targetRepo: "lumamax/devin-dashboard" },
  );

  assert.equal(result.score, 100);
  assert.equal(result.quotaScore, 50);
  assert.equal(result.lifecycleScore, 30);
  assert.equal(result.repoScore, 20);
  assert.equal(result.lifecycle, "active");
  assert.equal(result.disqualified, false);
});

test("scoreAccount disqualifies account with no credentials", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-2",
      name: "No Creds",
      quota: null,
      lifecycle: { hasCreds: false, testStatus: null, rateLimitedUntil: null, lastError: null },
      repo: { assignedRepoFullName: null, assignedBranch: null },
    },
    { targetRepo: null },
  );

  assert.equal(result.disqualified, true);
  assert.equal(result.lifecycle, "needs-relink");
  assert.equal(result.score, 0);
  assert.equal(result.disqualifyReason, "Account credentials missing or expired");
});

test("scoreAccount disqualifies rate-limited account", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const futureDate = new Date(Date.now() + 3600_000).toISOString();
  const result = scoreAccount(
    {
      id: "acc-3",
      name: "Rate Limited",
      quota: { dailyPercentage: 50, weeklyPercentage: 80 },
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: futureDate, lastError: null },
      repo: { assignedRepoFullName: null, assignedBranch: null },
    },
    { targetRepo: null },
  );

  assert.equal(result.disqualified, true);
  assert.equal(result.lifecycle, "rate-limited");
  assert.equal(result.score, 0);
});

test("scoreAccount marks exhausted when daily quota is zero", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-4",
      name: "Exhausted",
      quota: { dailyPercentage: 0, weeklyPercentage: 30 },
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
      repo: { assignedRepoFullName: null, assignedBranch: null },
    },
    { targetRepo: null },
  );

  assert.equal(result.disqualified, true);
  assert.equal(result.lifecycle, "exhausted");
  assert.equal(result.score, 0);
});

test("scoreAccount detects draining state when weekly quota is low", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-5",
      name: "Draining",
      quota: { dailyPercentage: 40, weeklyPercentage: 8 },
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
      repo: { assignedRepoFullName: null, assignedBranch: null },
    },
    { targetRepo: null },
  );

  assert.equal(result.disqualified, false);
  assert.equal(result.lifecycle, "draining");
  assert.ok(result.score > 0);
  assert.equal(result.lifecycleScore, 15);
});

test("scoreAccount gives zero repo score when target repo does not match", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-6",
      name: "Wrong Repo",
      quota: { dailyPercentage: 100, weeklyPercentage: 100 },
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
      repo: { assignedRepoFullName: "lumamax/other-repo", assignedBranch: "main" },
    },
    { targetRepo: "lumamax/devin-dashboard" },
  );

  assert.equal(result.repoScore, 0);
  assert.equal(result.score, 80);
});

test("scoreAccount gives partial repo score when no target repo specified", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-7",
      name: "No Target",
      quota: { dailyPercentage: 100, weeklyPercentage: 100 },
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
      repo: { assignedRepoFullName: "lumamax/devin-dashboard", assignedBranch: "main" },
    },
    { targetRepo: null },
  );

  assert.equal(result.repoScore, 10);
  assert.equal(result.score, 90);
});

test("rankAccounts sorts disqualified accounts last and highest score first", async () => {
  const { rankAccounts } = await import("../src/lib/accountScorer.ts");
  const ranked = rankAccounts(
    [
      {
        id: "low",
        name: "Low Quota",
        quota: { dailyPercentage: 20, weeklyPercentage: 20 },
        lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
        repo: { assignedRepoFullName: null, assignedBranch: null },
      },
      {
        id: "dq",
        name: "No Creds",
        quota: null,
        lifecycle: { hasCreds: false, testStatus: null, rateLimitedUntil: null, lastError: null },
        repo: { assignedRepoFullName: null, assignedBranch: null },
      },
      {
        id: "best",
        name: "Best",
        quota: { dailyPercentage: 100, weeklyPercentage: 100 },
        lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
        repo: { assignedRepoFullName: "lumamax/devin-dashboard", assignedBranch: "main" },
      },
    ],
    { targetRepo: "lumamax/devin-dashboard" },
  );

  assert.equal(ranked.length, 3);
  assert.equal(ranked[0]!.accountId, "best");
  assert.equal(ranked[0]!.disqualified, false);
  assert.equal(ranked[1]!.accountId, "low");
  assert.equal(ranked[1]!.disqualified, false);
  assert.equal(ranked[2]!.accountId, "dq");
  assert.equal(ranked[2]!.disqualified, true);
});

test("scoreAccount handles errored lifecycle correctly", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-err",
      name: "Errored",
      quota: { dailyPercentage: 80, weeklyPercentage: 60 },
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: "Some API error" },
      repo: { assignedRepoFullName: null, assignedBranch: null },
    },
    { targetRepo: null },
  );

  assert.equal(result.lifecycle, "errored");
  assert.equal(result.disqualified, false);
  assert.equal(result.lifecycleScore, 10);
  assert.ok(result.score > 0);
});

test("resolveLifecycle treats expired rate-limit as active", async () => {
  const { resolveLifecycle } = await import("../src/lib/accountScorer.ts");
  const pastDate = new Date(Date.now() - 3600_000).toISOString();
  const lifecycle = resolveLifecycle(
    { hasCreds: true, testStatus: "valid", rateLimitedUntil: pastDate, lastError: null },
    { dailyPercentage: 50, weeklyPercentage: 50 },
  );
  assert.equal(lifecycle, "active");
});

test("effectiveHeadroom returns the tighter of daily and weekly remaining", async () => {
  const { effectiveHeadroom } = await import("../src/lib/accountScorer.ts");
  assert.equal(effectiveHeadroom({ dailyPercentage: 80, weeklyPercentage: 40 }), 40);
  assert.equal(effectiveHeadroom({ dailyPercentage: 12, weeklyPercentage: 70 }), 12);
});

test("effectiveHeadroom falls back to the present value when one side is null", async () => {
  const { effectiveHeadroom } = await import("../src/lib/accountScorer.ts");
  assert.equal(effectiveHeadroom({ dailyPercentage: null, weeklyPercentage: 25 }), 25);
  assert.equal(effectiveHeadroom({ dailyPercentage: 50, weeklyPercentage: null }), 50);
});

test("effectiveHeadroom is null when no quota data is available", async () => {
  const { effectiveHeadroom } = await import("../src/lib/accountScorer.ts");
  assert.equal(effectiveHeadroom(null), null);
  assert.equal(effectiveHeadroom({ dailyPercentage: null, weeklyPercentage: null }), null);
});

test("computeQuotaBand maps headroom to the sync-contract bands", async () => {
  const { computeQuotaBand } = await import("../src/lib/accountScorer.ts");
  assert.equal(computeQuotaBand(null), "unknown");
  assert.equal(computeQuotaBand(80), "healthy");
  assert.equal(computeQuotaBand(20.01), "healthy");
  assert.equal(computeQuotaBand(20), "draining");
  assert.equal(computeQuotaBand(15), "draining");
  assert.equal(computeQuotaBand(10), "checkpoint");
  assert.equal(computeQuotaBand(7), "checkpoint");
  assert.equal(computeQuotaBand(5), "forced-handoff");
  assert.equal(computeQuotaBand(3), "forced-handoff");
  assert.equal(computeQuotaBand(2), "stop-work");
  assert.equal(computeQuotaBand(1), "stop-work");
  assert.equal(computeQuotaBand(0), "exhausted");
  assert.equal(computeQuotaBand(-5), "exhausted");
});

test("scoreAccount tags healthy account with quotaBand=healthy", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-h",
      name: "Healthy",
      quota: { dailyPercentage: 90, weeklyPercentage: 80 },
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
      repo: { assignedRepoFullName: null, assignedBranch: null },
    },
    { targetRepo: null },
  );
  assert.equal(result.quotaBand, "healthy");
  assert.equal(result.effectiveHeadroom, 80);
});

test("scoreAccount tags 8% weekly as checkpoint band but keeps lifecycle qualified", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-cp",
      name: "Checkpoint Zone",
      quota: { dailyPercentage: 40, weeklyPercentage: 8 },
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
      repo: { assignedRepoFullName: null, assignedBranch: null },
    },
    { targetRepo: null },
  );
  assert.equal(result.quotaBand, "checkpoint");
  assert.equal(result.effectiveHeadroom, 8);
  assert.equal(result.disqualified, false);
});

test("scoreAccount tags 3% effective headroom as forced-handoff", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-fh",
      name: "Forced Handoff",
      quota: { dailyPercentage: 3, weeklyPercentage: 60 },
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
      repo: { assignedRepoFullName: null, assignedBranch: null },
    },
    { targetRepo: null },
  );
  assert.equal(result.quotaBand, "forced-handoff");
  assert.equal(result.effectiveHeadroom, 3);
});

test("scoreAccount tags 1% effective headroom as stop-work", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-sw",
      name: "Stop Work",
      quota: { dailyPercentage: 50, weeklyPercentage: 1 },
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
      repo: { assignedRepoFullName: null, assignedBranch: null },
    },
    { targetRepo: null },
  );
  assert.equal(result.quotaBand, "stop-work");
  assert.equal(result.effectiveHeadroom, 1);
});

test("scoreAccount tags zero headroom as exhausted band and disqualifies", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-ex",
      name: "Exhausted",
      quota: { dailyPercentage: 0, weeklyPercentage: 30 },
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
      repo: { assignedRepoFullName: null, assignedBranch: null },
    },
    { targetRepo: null },
  );
  assert.equal(result.quotaBand, "exhausted");
  assert.equal(result.effectiveHeadroom, 0);
  assert.equal(result.disqualified, true);
});

test("scoreAccount returns quotaBand=unknown when no quota data is available", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-u",
      name: "Unknown Quota",
      quota: null,
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
      repo: { assignedRepoFullName: null, assignedBranch: null },
    },
    { targetRepo: null },
  );
  assert.equal(result.quotaBand, "unknown");
  assert.equal(result.effectiveHeadroom, null);
});
