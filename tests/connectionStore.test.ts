/**
 * Connection store round-trips Devin Web credentials via OmniRoute's
 * /api/providers/client and /api/providers endpoints. Since we don't run
 * a real OmniRoute in this test env, the tests use a small fetch stub.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

const ORIG_FETCH = globalThis.fetch;

async function withMockedOmniroute<T>(
  handler: (req: { url: string; init?: RequestInit }) => Response | Promise<Response>,
  body: () => Promise<T>
): Promise<T> {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler({ url, init });
  }) as typeof fetch;
  try {
    return await body();
  } finally {
    globalThis.fetch = ORIG_FETCH;
  }
}

test("listStoredAccounts filters devin-web and parses creds JSON", async () => {
  process.env.OMNIROUTE_TOKEN = "test-token";
  process.env.OMNIROUTE_URL = "http://omniroute.test";
  const mod = await import("../src/lib/connectionStore.ts");
  const result = await withMockedOmniroute(
    ({ url }) => {
      assert.equal(url, "http://omniroute.test/api/providers/client");
      return new Response(
        JSON.stringify({
          connections: [
            {
              id: "conn-1",
              provider: "openai",
              name: "OpenAI 1",
              apiKey: "sk-redacted",
            },
            {
              id: "conn-2",
              provider: "devin-web",
              name: "Devin Work",
              priority: 50,
              testStatus: "valid",
              apiKey: JSON.stringify({
                version: 1,
                kind: "devin-web-creds",
                cookie: "wos-session=abc",
                bearer: "eyJhbGc.bearer-jwt-here",
                orgId: "org-deadbeef",
              }),
            },
            {
              id: "conn-3",
              provider: "devin-web",
              name: "Devin Legacy",
              apiKey: "wos-session=just-a-cookie",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    },
    async () => mod.listStoredAccounts()
  );
  assert.equal(result.length, 2, "filters out non-devin-web rows");
  assert.equal(result[0].id, "conn-2");
  assert.ok(result[0].creds, "structured creds parsed");
  assert.equal(result[0].creds?.orgId, "org-deadbeef");
  assert.equal(result[1].id, "conn-3");
  assert.equal(result[1].creds, null, "legacy cookie row has no parsed creds");
});

test("saveAccount sends Bearer-authed POST with JSON envelope", async () => {
  process.env.OMNIROUTE_TOKEN = "test-token";
  process.env.OMNIROUTE_URL = "http://omniroute.test";
  const mod = await import("../src/lib/connectionStore.ts");
  const captured: { url: string; init?: RequestInit } = { url: "" };
  const result = await withMockedOmniroute(
    ({ url, init }) => {
      captured.url = url;
      captured.init = init;
      return new Response(JSON.stringify({ id: "new-conn-id" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    async () =>
      mod.saveAccount({
        name: "Devin Test",
        creds: { cookie: "wos-session=zzz", bearer: "bearer-jwt-test", orgId: "org-test" },
      })
  );
  assert.equal(result.id, "new-conn-id");
  assert.equal(captured.url, "http://omniroute.test/api/providers");
  assert.equal(captured.init?.method, "POST");
  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer test-token");
  const body = JSON.parse(String(captured.init?.body));
  assert.equal(body.provider, "devin-web");
  assert.equal(body.name, "Devin Test");
  const apiKey = JSON.parse(body.apiKey);
  assert.equal(apiKey.kind, "devin-web-creds");
  assert.equal(apiKey.bearer, "bearer-jwt-test");
  assert.equal(apiKey.orgId, "org-test");
});

test("getEnv throws when OMNIROUTE_TOKEN is missing", async () => {
  delete process.env.OMNIROUTE_TOKEN;
  const mod = await import("../src/lib/connectionStore.ts");
  await assert.rejects(
    async () =>
      mod.saveAccount({
        name: "x",
        creds: { cookie: "", bearer: "y", orgId: "z" },
      }),
    /OMNIROUTE_TOKEN/
  );
});

test("listStoredAccounts does not call the SQLite fallback when the API succeeds", async () => {
  process.env.OMNIROUTE_TOKEN = "test-token";
  process.env.OMNIROUTE_URL = "http://omniroute.test";
  // Set a bogus DB path that would crash sqlite3 if it ran.
  process.env.OMNIROUTE_DB_PATH = "/nonexistent/path/that/should/never/be/touched.sqlite";
  const mod = await import("../src/lib/connectionStore.ts");
  const result = await withMockedOmniroute(
    () =>
      new Response(JSON.stringify({ connections: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    async () => mod.listStoredAccounts()
  );
  assert.deepEqual(result, [], "empty list from API should pass through without invoking SQLite");
  delete process.env.OMNIROUTE_DB_PATH;
});
