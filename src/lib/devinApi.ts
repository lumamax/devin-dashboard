/**
 * Devin web API client. Uses Bearer + x-cog-org-id captured via
 * captureLogin.ts. Handles silent token refresh on 401 by hitting
 * `POST /api/users/post-auth` with the stored cookie jar.
 */

export type DevinCreds = {
  /** WorkOS session cookie line, e.g. "wos-session=abc; other=def". */
  cookie: string;
  /** Short-lived JWT for the Devin API. */
  bearer: string;
  /** Organization id, e.g. "org-deadbeef…". Required header. */
  orgId: string;
};

export type RefreshHook = (next: DevinCreds) => void | Promise<void>;

const BASE_URL = "https://app.devin.ai";

export class DevinApiError extends Error {
  status: number;
  url: string;
  bodyText: string;
  constructor(message: string, status: number, url: string, bodyText: string) {
    super(message);
    this.status = status;
    this.url = url;
    this.bodyText = bodyText;
    this.name = "DevinApiError";
  }
}

export async function devinGet<T = unknown>(
  path: string,
  creds: DevinCreds,
  onRefresh?: RefreshHook,
): Promise<
  { ok: true; data: T; creds: DevinCreds } | { ok: false; error: DevinApiError }
> {
  return devinRequest<T>("GET", path, undefined, creds, onRefresh, "json");
}

export async function devinGetText(
  path: string,
  creds: DevinCreds,
  onRefresh?: RefreshHook,
): Promise<
  { ok: true; data: string; creds: DevinCreds } | { ok: false; error: DevinApiError }
> {
  return devinRequest<string>("GET", path, undefined, creds, onRefresh, "text");
}

export async function devinPost<T = unknown>(
  path: string,
  body: unknown,
  creds: DevinCreds,
  onRefresh?: RefreshHook,
): Promise<
  { ok: true; data: T; creds: DevinCreds } | { ok: false; error: DevinApiError }
> {
  return devinRequest<T>("POST", path, body, creds, onRefresh, "json");
}

async function devinRequest<T>(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  creds: DevinCreds,
  onRefresh?: RefreshHook,
  responseType: "json" | "text" = "json",
): Promise<
  { ok: true; data: T; creds: DevinCreds } | { ok: false; error: DevinApiError }
> {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const init = buildInit(method, body, creds);
  let response = await fetch(url, init);

  if (response.status === 401) {
    // Try to refresh the Bearer via post-auth (cookie-only).
    const refreshed = await refreshBearer(creds).catch(() => null);
    if (refreshed) {
      const nextCreds = {
        ...creds,
        bearer: refreshed.bearer,
        orgId: refreshed.orgId || creds.orgId,
      };
      if (onRefresh) await onRefresh(nextCreds);
      response = await fetch(url, buildInit(method, body, nextCreds));
      if (response.ok) {
        if (responseType === "text") {
          return {
            ok: true,
            data: (await response.text()) as T,
            creds: nextCreds,
          };
        }
        return {
          ok: true,
          data: (await response.json()) as T,
          creds: nextCreds,
        };
      }
    }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      error: new DevinApiError(
        `Devin API ${method} ${path} failed: ${response.status}`,
        response.status,
        url,
        text.slice(0, 500),
      ),
    };
  }

  if (responseType === "text") {
    return { ok: true, data: (await response.text()) as T, creds };
  }

  try {
    const data = (await response.json()) as T;
    return { ok: true, data, creds };
  } catch (err) {
    return {
      ok: false,
      error: new DevinApiError(
        `Devin API ${method} ${path} returned non-JSON: ${(err as Error).message}`,
        response.status,
        url,
        "",
      ),
    };
  }
}

function buildInit(
  method: "GET" | "POST",
  body: unknown,
  creds: DevinCreds,
): RequestInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${creds.bearer}`,
    "x-cog-org-id": creds.orgId,
    // Some endpoints validate referer; faking it as the SPA is harmless.
    Referer: `${BASE_URL}/`,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  };
  if (creds.cookie) headers["Cookie"] = creds.cookie;
  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
  };
  if (method === "POST" && body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return init;
}

async function refreshBearer(
  creds: DevinCreds,
): Promise<{ bearer: string; orgId?: string } | null> {
  if (!creds.cookie) return null;
  // POST /api/users/post-auth is what the SPA calls right after WorkOS
  // redirects back. It accepts cookie-only and returns a fresh JWT.
  // The response shape was redacted in our HAR but the SPA pulls a token
  // out and starts attaching it as Bearer to every subsequent call.
  const url = `${BASE_URL}/api/users/post-auth`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Cookie: creds.cookie,
      Referer: `${BASE_URL}/`,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({}),
    cache: "no-store",
  });
  if (!res.ok) return null;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  const bearer = extractBearer(json);
  if (!bearer) return null;
  const orgId = extractOrgId(json);
  return { bearer, orgId };
}

export async function resolveCredsFromCookie(
  cookie: string,
): Promise<DevinCreds | null> {
  const refreshed = await refreshBearer({ cookie, bearer: "", orgId: "" });
  if (!refreshed?.bearer || !refreshed.orgId) {
    return null;
  }

  return {
    cookie,
    bearer: refreshed.bearer,
    orgId: refreshed.orgId,
  };
}

function extractBearer(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  for (const key of ["bearer", "token", "access_token", "accessToken", "jwt"]) {
    const v = o[key];
    if (typeof v === "string" && v.length > 10) return v;
  }
  // Nested under `auth` / `session` / `data`.
  for (const key of ["auth", "session", "data", "user"]) {
    const nested = o[key];
    if (nested && typeof nested === "object") {
      const v = extractBearer(nested);
      if (v) return v;
    }
  }
  return null;
}

function extractOrgId(obj: unknown): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  for (const key of ["orgId", "org_id", "organization_id", "organizationId"]) {
    const v = o[key];
    if (typeof v === "string" && v.startsWith("org-")) return v;
  }
  for (const key of ["org", "organization", "user", "session"]) {
    const nested = o[key];
    if (nested && typeof nested === "object") {
      const v = extractOrgId(nested);
      if (v) return v;
    }
  }
  return undefined;
}
