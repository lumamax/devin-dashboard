/**
 * Devin API client tests — Bearer/cookie attachment, 401-refresh path.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

const ORIG_FETCH = globalThis.fetch;

test("devinGet attaches Bearer + x-cog-org-id and parses JSON", async () => {
  const { devinGet } = await import("../src/lib/devinApi.ts");
  const captured: { url?: string; init?: RequestInit } = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.url = typeof input === "string" ? input : input.toString();
    captured.init = init;
    return new Response(JSON.stringify({ acu_used: 0.5, max_acu_limit: 10 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const result = await devinGet<{ acu_used: number }>(
      "/api/org-x/billing/quota/usage",
      { cookie: "wos-session=abc", bearer: "bearer-jwt-1", orgId: "org-x" }
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.acu_used, 0.5);
    assert.ok(captured.url?.startsWith("https://app.devin.ai/"));
    const headers = captured.init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer bearer-jwt-1");
    assert.equal(headers["x-cog-org-id"], "org-x");
    assert.ok(headers.Cookie?.includes("wos-session=abc"));
  } finally {
    globalThis.fetch = ORIG_FETCH;
  }
});

test("devinGet retries with refreshed bearer on 401", async () => {
  const { devinGet } = await import("../src/lib/devinApi.ts");
  let call = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    call++;
    if (call === 1) {
      // First call: real endpoint returns 401
      return new Response("unauthorized", { status: 401 });
    }
    if (call === 2 && url.endsWith("/api/users/post-auth")) {
      // Refresh endpoint returns new bearer
      return new Response(
        JSON.stringify({ access_token: "new-bearer-jwt", orgId: "org-x" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    // Retry of original endpoint: succeeds
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer new-bearer-jwt");
    return new Response(JSON.stringify({ ok: true, refreshed: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    let refreshed: { bearer: string; orgId: string } | null = null;
    const result = await devinGet<Record<string, unknown>>(
      "/api/org-x/billing/quota/usage",
      { cookie: "wos-session=abc", bearer: "old-bearer", orgId: "org-x" },
      (next) => {
        refreshed = { bearer: next.bearer, orgId: next.orgId };
      }
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.refreshed, true);
    assert.deepEqual(refreshed, { bearer: "new-bearer-jwt", orgId: "org-x" });
  } finally {
    globalThis.fetch = ORIG_FETCH;
  }
});

test("devinGet surfaces non-401 errors without refresh", async () => {
  const { devinGet, DevinApiError } = await import("../src/lib/devinApi.ts");
  globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  try {
    const result = await devinGet<unknown>("/api/x", {
      cookie: "wos-session=abc",
      bearer: "b",
      orgId: "org-x",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error instanceof DevinApiError);
      assert.equal(result.error.status, 500);
    }
  } finally {
    globalThis.fetch = ORIG_FETCH;
  }
});
