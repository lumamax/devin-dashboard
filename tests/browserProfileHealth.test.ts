import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { StoredDevinAccount } from "../src/lib/connectionStore.ts";

const { assessBrowserProfile } = await import("../src/lib/browserProfileHealth.ts");

test("missing profile with no stored cookie requires relink", () => {
  const account = buildAccount({ userDataDir: path.join(tmpdir(), "devin-dashboard-missing-health"), cookie: "" });
  const health = assessBrowserProfile(account);

  assert.equal(health.state, "relink-required");
  assert.equal(health.code, "profile_missing_no_cookie");
});

test("missing profile with stored cookie is recoverable", () => {
  const account = buildAccount({ userDataDir: path.join(tmpdir(), "devin-dashboard-recoverable-health"), cookie: "webapp_logged_in=true" });
  const health = assessBrowserProfile(account);

  assert.equal(health.state, "recoverable");
  assert.equal(health.code, "profile_missing_cookie_available");
});

test("existing profile with Devin cookie marker is ready", () => {
  const root = mkdtempSync(path.join(tmpdir(), "devin-dashboard-health-"));
  try {
    const cookieDir = path.join(root, "Default", "Network");
    mkdirSync(cookieDir, { recursive: true });
    writeFileSync(path.join(cookieDir, "Cookies"), "app.devin.ai webapp_logged_in", "utf8");

    const account = buildAccount({ userDataDir: root, cookie: "" });
    const health = assessBrowserProfile(account);

    assert.equal(health.state, "ready");
    assert.equal(health.code, "profile_cookie_present");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("existing profile without browser or stored cookie requires relink", () => {
  const root = mkdtempSync(path.join(tmpdir(), "devin-dashboard-health-empty-"));
  try {
    mkdirSync(path.join(root, "Default"), { recursive: true });
    const account = buildAccount({ userDataDir: root, cookie: "" });
    const health = assessBrowserProfile(account);

    assert.equal(health.state, "relink-required");
    assert.equal(health.code, "profile_exists_no_cookie");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function buildAccount(input: { userDataDir: string; cookie: string }): StoredDevinAccount {
  return {
    id: "account-1",
    name: "Test Devin",
    priority: 1,
    testStatus: "valid",
    rateLimitedUntil: null,
    lastError: null,
    creds: {
      cookie: input.cookie,
      bearer: "auth1_test",
      orgId: "org-test",
    },
    rawApiKey: null,
    createdAt: null,
    updatedAt: null,
    providerSpecificData: {
      devinDashboard: {
        launchStrategy: "user-data-dir",
        userDataDir: input.userDataDir,
      },
    },
    launchContext: {
      launchStrategy: "user-data-dir",
      userDataDir: input.userDataDir,
    },
  };
}
