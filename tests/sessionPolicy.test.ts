import { strict as assert } from "node:assert";
import { test } from "node:test";

test("isLiveDevinSession treats running sessions as live and suspended as terminal", async () => {
  const { isLiveDevinSession } = await import("../src/lib/sessionPolicy.ts");

  assert.equal(isLiveDevinSession({ status: "running", isArchived: false }), true);
  assert.equal(isLiveDevinSession({ status: "claimed", isArchived: false }), true);
  assert.equal(isLiveDevinSession({ status: "suspended", isArchived: false }), false);
  assert.equal(isLiveDevinSession({ status: "running", isArchived: true }), false);
});

test("decideRepoAttachSession reuses the stored prepared session first", async () => {
  const { decideRepoAttachSession } = await import("../src/lib/sessionPolicy.ts");

  const decision = decideRepoAttachSession({
    targetRepoFullName: "lumamax/devin-dashboard",
    lastPreparedSessionId: "devin-2",
    sessions: [
      {
        devinId: "devin-1",
        title: "other session",
        status: "running",
        activityStatus: null,
        currentActivity: null,
        maxAcuLimit: null,
        sessionOrigin: null,
        isArchived: false,
        createdAt: null,
        updatedAt: null,
        tags: [],
        latestStatus: null,
        raw: {},
      },
      {
        devinId: "devin-2",
        title: "Prepare lumamax/devin-dashboard",
        status: "running",
        activityStatus: null,
        currentActivity: null,
        maxAcuLimit: null,
        sessionOrigin: null,
        isArchived: false,
        createdAt: null,
        updatedAt: null,
        tags: [],
        latestStatus: null,
        raw: {},
      },
    ],
  });

  assert.equal(decision.action, "reuse");
  assert.equal(decision.session.devinId, "devin-2");
});

test("decideRepoAttachSession reuses a live session whose title already matches the repo", async () => {
  const { decideRepoAttachSession } = await import("../src/lib/sessionPolicy.ts");

  const decision = decideRepoAttachSession({
    targetRepoFullName: "lumamax/devin-dashboard",
    sessions: [
      {
        devinId: "devin-3",
        title: "Prepare this Devin session for lumamax/devin-dashboard",
        status: "running",
        activityStatus: null,
        currentActivity: null,
        maxAcuLimit: null,
        sessionOrigin: null,
        isArchived: false,
        createdAt: null,
        updatedAt: null,
        tags: [],
        latestStatus: null,
        raw: {},
      },
    ],
  });

  assert.equal(decision.action, "reuse");
  assert.equal(decision.session.devinId, "devin-3");
});

test("decideRepoAttachSession blocks a new attach when the account already has another live session", async () => {
  const { decideRepoAttachSession } = await import("../src/lib/sessionPolicy.ts");

  const decision = decideRepoAttachSession({
    targetRepoFullName: "lumamax/devin-dashboard",
    sessions: [
      {
        devinId: "devin-busy",
        title: "trace ping",
        status: "running",
        activityStatus: null,
        currentActivity: null,
        maxAcuLimit: null,
        sessionOrigin: null,
        isArchived: false,
        createdAt: null,
        updatedAt: null,
        tags: [],
        latestStatus: null,
        raw: {},
      },
    ],
  });

  assert.equal(decision.action, "blocked");
  assert.equal(decision.session.devinId, "devin-busy");
});

test("decideRepoAttachSession starts a new session when nothing live exists", async () => {
  const { decideRepoAttachSession } = await import("../src/lib/sessionPolicy.ts");

  const decision = decideRepoAttachSession({
    targetRepoFullName: "lumamax/devin-dashboard",
    sessions: [
      {
        devinId: "devin-old",
        title: "Prepare this Devin session for lumamax/devin-dashboard",
        status: "suspended",
        activityStatus: null,
        currentActivity: null,
        maxAcuLimit: null,
        sessionOrigin: null,
        isArchived: false,
        createdAt: null,
        updatedAt: null,
        tags: [],
        latestStatus: null,
        raw: {},
      },
    ],
  });

  assert.deepEqual(decision, { action: "start-new" });
});
