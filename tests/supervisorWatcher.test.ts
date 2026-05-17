import test from "node:test";
import assert from "node:assert/strict";

const {
  buildQuotaInterventionPrompt,
  classifyQuotaBand,
  resolveSupervisorPaths,
  selectActionableSession,
  summarizeQuotaUsage,
} = await import("../src/lib/supervisorWatcher.ts");

test("classifyQuotaBand follows the 20/10/5/2 thresholds", () => {
  assert.equal(classifyQuotaBand(null), "unknown");
  assert.equal(classifyQuotaBand(55), "healthy");
  assert.equal(classifyQuotaBand(20), "draining");
  assert.equal(classifyQuotaBand(10), "checkpoint");
  assert.equal(classifyQuotaBand(5), "force");
  assert.equal(classifyQuotaBand(2), "stop");
  assert.equal(classifyQuotaBand(0), "exhausted");
});

test("resolveSupervisorPaths defaults to DEVIN_DASHBOARD_HOME when set", () => {
  const previousHome = process.env.DEVIN_DASHBOARD_HOME;
  const previousSupervisorHome = process.env.DEVIN_SUPERVISOR_HOME;
  delete process.env.DEVIN_SUPERVISOR_HOME;
  process.env.DEVIN_DASHBOARD_HOME = "/tmp/devin-dashboard-home-for-test";

  try {
    const paths = resolveSupervisorPaths();
    assert.equal(paths.rootDir, "/tmp/devin-dashboard-home-for-test");
  } finally {
    restoreEnv("DEVIN_DASHBOARD_HOME", previousHome);
    restoreEnv("DEVIN_SUPERVISOR_HOME", previousSupervisorHome);
  }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

test("summarizeQuotaUsage converts used percentages into remaining headroom", () => {
  const summary = summarizeQuotaUsage({
    daily_percentage: 92,
    weekly_percentage: 61,
    daily_reset_at: "2026-05-17T00:00:00.000Z",
  });

  assert.equal(summary.dailyRemaining, 8);
  assert.equal(summary.weeklyRemaining, 39);
  assert.equal(summary.effectiveRemaining, 8);
  assert.equal(summary.band, "checkpoint");
  assert.equal(summary.resetAt, "2026-05-17T00:00:00.000Z");
});

test("buildQuotaInterventionPrompt includes repo and successor guidance", () => {
  const prompt = buildQuotaInterventionPrompt({
    action: "force",
    accountName: "andrey",
    repoFullName: "lumamax/devin-dashboard",
    branch: "main",
    sessionId: "devin-123",
    dailyRemaining: 4,
    weeklyRemaining: 19,
    effectiveRemaining: 4,
    successor: {
      accountId: "acc-2",
      name: "ghoulgpt5",
      score: 91,
      lifecycle: "active",
      dailyPercentage: 78,
      weeklyPercentage: 80,
    },
  });

  assert.match(prompt, /forced handoff zone/i);
  assert.match(prompt, /lumamax\/devin-dashboard/);
  assert.match(prompt, /ghoulgpt5/);
  assert.match(prompt, /devin-123/);
});

test("selectActionableSession prefers a running or blocked session over finished history", () => {
  const chosen = selectActionableSession([
    {
      devinId: "devin-old-finished",
      title: "done",
      status: "finished",
      activityStatus: null,
      currentActivity: null,
      maxAcuLimit: null,
      sessionOrigin: null,
      isArchived: false,
      createdAt: null,
      updatedAt: "2026-05-16T08:00:00.000Z",
      tags: [],
      latestStatus: { enum: "finished", message: null, timestamp: null, userActionRequired: false },
      raw: {},
    },
    {
      devinId: "devin-active",
      title: "working",
      status: "running",
      activityStatus: "coding",
      currentActivity: null,
      maxAcuLimit: null,
      sessionOrigin: null,
      isArchived: false,
      createdAt: null,
      updatedAt: "2026-05-16T07:00:00.000Z",
      tags: [],
      latestStatus: { enum: "working", message: null, timestamp: null, userActionRequired: false },
      raw: {},
    },
  ]);

  assert.equal(chosen?.devinId, "devin-active");
});
