import { strict as assert } from "node:assert";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";

const ORIG_FETCH = globalThis.fetch;

function makeEnv() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    GITHUB_APP_ID: "123456",
    GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
    GITHUB_APP_INSTALLATION_ID: "987654",
    GITHUB_APP_OWNER: "lumamax",
    GITHUB_APP_WEBHOOK_SECRET: "test-secret",
  };
}

test("getGitHubAppStatus reports missing config when env is absent", async () => {
  delete process.env.GITHUB_APP_ID;
  delete process.env.GITHUB_APP_PRIVATE_KEY;
  delete process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
  const mod = await import("../src/lib/githubApp.ts");
  const status = mod.getGitHubAppStatus();
  assert.equal(status.configured, false);
  assert.ok(status.missing.includes("GITHUB_APP_ID"));
  assert.ok(status.missing.includes("GITHUB_APP_PRIVATE_KEY"));
});

test("createGitHubAppJwt signs a short-lived app JWT", async () => {
  Object.assign(process.env, makeEnv());
  const mod = await import("../src/lib/githubApp.ts");
  const env = mod.requireGitHubAppEnv();
  const jwt = mod.createGitHubAppJwt(env, new Date("2026-05-16T00:00:00.000Z"));
  const parts = jwt.split(".");
  assert.equal(parts.length, 3);
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  assert.equal(payload.iss, "123456");
  assert.ok(payload.exp > payload.iat);
  assert.ok(payload.exp - payload.iat <= 10 * 60);
});

test("mintInstallationToken posts narrowed repo and permissions to GitHub", async () => {
  Object.assign(process.env, makeEnv());
  const mod = await import("../src/lib/githubApp.ts");
  const captured: { url?: string; init?: RequestInit } = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.url = typeof input === "string" ? input : input.toString();
    captured.init = init;
    return new Response(
      JSON.stringify({
        token: "ghs_test_token",
        expires_at: "2026-05-16T01:00:00Z",
        permissions: { contents: "write", pull_requests: "write" },
        repositories: [{ id: 1, name: "devin-dashboard", full_name: "lumamax/devin-dashboard" }],
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const token = await mod.mintInstallationToken({
      repositories: ["devin-dashboard"],
      permissions: { contents: "write", pull_requests: "write" },
    });
    assert.equal(token.token, "ghs_test_token");
    assert.equal(
      captured.url,
      "https://api.github.com/app/installations/987654/access_tokens",
    );
    assert.equal(captured.init?.method, "POST");
    const headers = captured.init?.headers as Record<string, string>;
    assert.ok(headers.Authorization.startsWith("Bearer "));
    const body = JSON.parse(String(captured.init?.body));
    assert.deepEqual(body.repositories, ["devin-dashboard"]);
    assert.deepEqual(body.permissions, { contents: "write", pull_requests: "write" });
  } finally {
    globalThis.fetch = ORIG_FETCH;
  }
});

test("buildGitHubBootstrap returns clone commands for a single repo", async () => {
  Object.assign(process.env, makeEnv());
  const mod = await import("../src/lib/githubApp.ts");
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        token: "ghs_test_token",
        expires_at: "2026-05-16T01:00:00Z",
        permissions: { contents: "write" },
        repositories: [{ id: 1, name: "devin-dashboard", full_name: "lumamax/devin-dashboard" }],
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  try {
    const bootstrap = await mod.buildGitHubBootstrap({
      owner: "lumamax",
      repo: "devin-dashboard",
      branch: "main",
    });
    assert.ok(bootstrap.cloneUrl.includes("x-access-token:"));
    assert.ok(bootstrap.cloneUrl.includes("lumamax/devin-dashboard.git"));
    assert.deepEqual(bootstrap.commands, [
      `git clone ${bootstrap.cloneUrl}`,
      "cd devin-dashboard",
      "git checkout main",
    ]);
  } finally {
    globalThis.fetch = ORIG_FETCH;
  }
});
