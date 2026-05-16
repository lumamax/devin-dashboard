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

test("computeEffectiveHeadroom uses the tighter of daily and weekly", async () => {
  const { computeEffectiveHeadroom } = await import("../src/lib/accountScorer.ts");
  assert.equal(
    computeEffectiveHeadroom({ dailyPercentage: 60, weeklyPercentage: 15 }),
    15,
    "weekly is tighter",
  );
  assert.equal(
    computeEffectiveHeadroom({ dailyPercentage: 3, weeklyPercentage: 80 }),
    3,
    "daily is tighter",
  );
});

test("computeEffectiveHeadroom falls back to whichever side is known", async () => {
  const { computeEffectiveHeadroom } = await import("../src/lib/accountScorer.ts");
  assert.equal(
    computeEffectiveHeadroom({ dailyPercentage: null, weeklyPercentage: 22 }),
    22,
  );
  assert.equal(
    computeEffectiveHeadroom({ dailyPercentage: 11, weeklyPercentage: null }),
    11,
  );
});

test("computeEffectiveHeadroom returns null when neither side is known", async () => {
  const { computeEffectiveHeadroom } = await import("../src/lib/accountScorer.ts");
  assert.equal(computeEffectiveHeadroom(null), null);
  assert.equal(
    computeEffectiveHeadroom({ dailyPercentage: null, weeklyPercentage: null }),
    null,
  );
});

test("classifyQuotaBand reports unknown when no quota data is available", async () => {
  const { classifyQuotaBand } = await import("../src/lib/accountScorer.ts");
  assert.equal(classifyQuotaBand(null), "unknown");
  assert.equal(
    classifyQuotaBand({ dailyPercentage: null, weeklyPercentage: null }),
    "unknown",
  );
});

test("classifyQuotaBand reports healthy when headroom is above 20%", async () => {
  const { classifyQuotaBand } = await import("../src/lib/accountScorer.ts");
  assert.equal(
    classifyQuotaBand({ dailyPercentage: 80, weeklyPercentage: 60 }),
    "healthy",
  );
  assert.equal(
    classifyQuotaBand({ dailyPercentage: 21, weeklyPercentage: 100 }),
    "healthy",
    "21% is just above the draining boundary",
  );
});

test("classifyQuotaBand reports draining at 10–20% headroom", async () => {
  const { classifyQuotaBand } = await import("../src/lib/accountScorer.ts");
  assert.equal(
    classifyQuotaBand({ dailyPercentage: 50, weeklyPercentage: 20 }),
    "draining",
    "20% is the upper draining boundary",
  );
  assert.equal(
    classifyQuotaBand({ dailyPercentage: 50, weeklyPercentage: 11 }),
    "draining",
  );
});

test("classifyQuotaBand reports checkpoint at <=10% headroom", async () => {
  const { classifyQuotaBand } = await import("../src/lib/accountScorer.ts");
  assert.equal(
    classifyQuotaBand({ dailyPercentage: 80, weeklyPercentage: 10 }),
    "checkpoint",
    "10% is the upper checkpoint boundary",
  );
  assert.equal(
    classifyQuotaBand({ dailyPercentage: 6, weeklyPercentage: 80 }),
    "checkpoint",
  );
});

test("classifyQuotaBand reports forced-handoff at <=5% headroom", async () => {
  const { classifyQuotaBand } = await import("../src/lib/accountScorer.ts");
  assert.equal(
    classifyQuotaBand({ dailyPercentage: 5, weeklyPercentage: 30 }),
    "forced-handoff",
    "5% is the upper forced-handoff boundary",
  );
  assert.equal(
    classifyQuotaBand({ dailyPercentage: 90, weeklyPercentage: 3 }),
    "forced-handoff",
  );
});

test("classifyQuotaBand reports stop-work at <=2% headroom", async () => {
  const { classifyQuotaBand } = await import("../src/lib/accountScorer.ts");
  assert.equal(
    classifyQuotaBand({ dailyPercentage: 2, weeklyPercentage: 80 }),
    "stop-work",
    "2% is the upper stop-work boundary",
  );
  assert.equal(
    classifyQuotaBand({ dailyPercentage: 0, weeklyPercentage: 0 }),
    "stop-work",
  );
});

test("scoreAccount surfaces quotaBand and effectiveHeadroom on the result", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-band",
      name: "Banded",
      quota: { dailyPercentage: 40, weeklyPercentage: 4 },
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
      repo: { assignedRepoFullName: null, assignedBranch: null },
    },
    { targetRepo: null },
  );

  assert.equal(result.effectiveHeadroom, 4);
  assert.equal(result.quotaBand, "forced-handoff");
});

test("scoreAccount marks unknown band when quota is missing entirely", async () => {
  const { scoreAccount } = await import("../src/lib/accountScorer.ts");
  const result = scoreAccount(
    {
      id: "acc-no-quota",
      name: "No quota yet",
      quota: null,
      lifecycle: { hasCreds: true, testStatus: "valid", rateLimitedUntil: null, lastError: null },
      repo: { assignedRepoFullName: null, assignedBranch: null },
    },
    { targetRepo: null },
  );

  assert.equal(result.effectiveHeadroom, null);
  assert.equal(result.quotaBand, "unknown");
});
