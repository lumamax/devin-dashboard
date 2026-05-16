import { createPrivateKey, createSign } from "node:crypto";

const GITHUB_API_BASE = "https://api.github.com";

type GitHubPermissionValue = "read" | "write";

export type GitHubAppPermissions = Record<string, GitHubPermissionValue>;

export type GitHubAppEnv = {
  appId: string;
  privateKeyPem: string;
  webhookSecret: string | null;
  ownerHint: string | null;
  installationIdHint: number | null;
};

export type GitHubAppStatus = {
  configured: boolean;
  missing: string[];
  ownerHint: string | null;
  installationIdHint: number | null;
  hasWebhookSecret: boolean;
};

export type GitHubAppProfile = {
  id: number;
  slug: string;
  name: string | null;
  owner: {
    login: string | null;
    type: string | null;
  } | null;
};

export type GitHubAppInstallation = {
  id: number;
  appId: number | null;
  accountLogin: string | null;
  accountType: string | null;
  repositorySelection: string | null;
  targetType: string | null;
  suspendedAt: string | null;
};

export type GitHubInstallationTokenRequest = {
  installationId?: number | null;
  repositories?: string[];
  repositoryIds?: number[];
  permissions?: GitHubAppPermissions;
};

export type GitHubInstallationRepository = {
  id: number;
  name: string;
  fullName: string;
  private: boolean | null;
  defaultBranch: string | null;
};

export type GitHubInstallationToken = {
  token: string;
  expiresAt: string;
  permissions: GitHubAppPermissions;
  repositorySelection: string | null;
  repositories: GitHubInstallationRepository[];
};

export type GitHubBootstrapRequest = {
  installationId?: number | null;
  owner: string;
  repo: string;
  branch?: string | null;
  permissions?: GitHubAppPermissions;
};

export class MissingGitHubAppConfigError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(
      `Missing GitHub App config: ${missing.join(", ")}. Set these values in .env.local before using the broker.`
    );
    this.name = "MissingGitHubAppConfigError";
    this.missing = missing;
  }
}

export class GitHubAppError extends Error {
  status: number;
  url: string;
  bodyText: string;
  constructor(message: string, status: number, url: string, bodyText: string) {
    super(message);
    this.name = "GitHubAppError";
    this.status = status;
    this.url = url;
    this.bodyText = bodyText;
  }
}

export function getGitHubAppStatus(): GitHubAppStatus {
  const missing = collectMissingGitHubAppFields();
  return {
    configured: missing.length === 0,
    missing,
    ownerHint: readOwnerHint(),
    installationIdHint: readInstallationIdHint(),
    hasWebhookSecret: Boolean(readWebhookSecret()),
  };
}

export function requireGitHubAppEnv(): GitHubAppEnv {
  const missing = collectMissingGitHubAppFields();
  if (missing.length > 0) {
    throw new MissingGitHubAppConfigError(missing);
  }

  const appId = (process.env.GITHUB_APP_ID || "").trim();
  const privateKeyPem = readPrivateKeyPem();
  if (!privateKeyPem) {
    throw new MissingGitHubAppConfigError(["GITHUB_APP_PRIVATE_KEY"]);
  }

  return {
    appId,
    privateKeyPem,
    webhookSecret: readWebhookSecret(),
    ownerHint: readOwnerHint(),
    installationIdHint: readInstallationIdHint(),
  };
}

export function createGitHubAppJwt(env: GitHubAppEnv, now = new Date()): string {
  const issuedAt = Math.floor(now.getTime() / 1000) - 60;
  const expiresAt = issuedAt + 9 * 60;

  const header = base64urlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64urlJson({
    iat: issuedAt,
    exp: expiresAt,
    iss: env.appId,
  });

  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(createPrivateKey(env.privateKeyPem));
  return `${signingInput}.${base64url(signature)}`;
}

export async function getGitHubAppProfile(
  env = requireGitHubAppEnv(),
): Promise<GitHubAppProfile> {
  const json = await githubAppRequest<Record<string, unknown>>("/app", {
    method: "GET",
  }, env);

  const owner = asRecord(json.owner);
  return {
    id: asNumber(json.id) || 0,
    slug: asString(json.slug) || "",
    name: asString(json.name),
    owner: owner
      ? {
          login: asString(owner.login),
          type: asString(owner.type),
        }
      : null,
  };
}

export async function listGitHubAppInstallations(
  env = requireGitHubAppEnv(),
): Promise<GitHubAppInstallation[]> {
  const json = await githubAppRequest<Array<Record<string, unknown>>>(
    "/app/installations",
    { method: "GET" },
    env,
  );

  return json.map((installation) => {
    const account = asRecord(installation.account);
    return {
      id: asNumber(installation.id) || 0,
      appId: asNumber(installation.app_id),
      accountLogin: account ? asString(account.login) : null,
      accountType: account ? asString(account.type) : null,
      repositorySelection: asString(installation.repository_selection),
      targetType: asString(installation.target_type),
      suspendedAt: asString(installation.suspended_at),
    };
  });
}

export async function mintInstallationToken(
  request: GitHubInstallationTokenRequest,
  env = requireGitHubAppEnv(),
): Promise<GitHubInstallationToken> {
  const installationId = request.installationId || env.installationIdHint;
  if (!installationId) {
    throw new MissingGitHubAppConfigError(["GITHUB_APP_INSTALLATION_ID"]);
  }

  const body: Record<string, unknown> = {};
  if (request.repositories && request.repositories.length > 0) {
    body.repositories = request.repositories;
  }
  if (request.repositoryIds && request.repositoryIds.length > 0) {
    body.repository_ids = request.repositoryIds;
  }
  if (request.permissions && Object.keys(request.permissions).length > 0) {
    body.permissions = request.permissions;
  }

  const json = await githubAppRequest<Record<string, unknown>>(
    `/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      body,
    },
    env,
  );

  const repositories = normalizeRepositories(json.repositories);

  return {
    token: asString(json.token) || "",
    expiresAt: asString(json.expires_at) || "",
    permissions: normalizePermissions(asRecord(json.permissions)),
    repositorySelection: asString(json.repository_selection),
    repositories,
  };
}

export async function listInstallationRepositories(
  request: { installationId?: number | null } = {},
  env = requireGitHubAppEnv(),
): Promise<GitHubInstallationRepository[]> {
  const tokenResult = await mintInstallationToken(
    { installationId: request.installationId },
    env,
  );

  const url = `${GITHUB_API_BASE}/installation/repositories`;
  const response = await fetch(url, {
    method: "GET",
    headers: buildGitHubHeaders(`token ${tokenResult.token}`),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new GitHubAppError(
      `GitHub App GET /installation/repositories failed: ${response.status}`,
      response.status,
      url,
      text.slice(0, 600),
    );
  }

  const json = (await response.json()) as { repositories?: unknown };
  return normalizeRepositories(json.repositories);
}

export async function buildGitHubBootstrap(
  request: GitHubBootstrapRequest,
  env = requireGitHubAppEnv(),
) {
  const tokenResult = await mintInstallationToken(
    {
      installationId: request.installationId,
      repositories: [request.repo],
      permissions: request.permissions,
    },
    env,
  );

  const encodedToken = encodeURIComponent(tokenResult.token);
  const branch = request.branch?.trim() || "main";
  const cloneUrl = `https://x-access-token:${encodedToken}@github.com/${request.owner}/${request.repo}.git`;

  return {
    owner: request.owner,
    repo: request.repo,
    branch,
    cloneUrl,
    token: tokenResult.token,
    expiresAt: tokenResult.expiresAt,
    permissions: tokenResult.permissions,
    repositories: tokenResult.repositories,
    commands: [
      `git clone ${cloneUrl}`,
      `cd ${request.repo}`,
      `git checkout ${branch}`,
    ],
  };
}

async function githubAppRequest<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> },
  env: GitHubAppEnv,
): Promise<T> {
  const url = `${GITHUB_API_BASE}${path}`;
  const jwt = createGitHubAppJwt(env);
  const headers = buildGitHubHeaders(`Bearer ${jwt}`);

  const response = await fetch(url, {
    method: init.method,
    headers: init.body
      ? {
          ...headers,
          "Content-Type": "application/json",
        }
      : headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new GitHubAppError(
      `GitHub App ${init.method} ${path} failed: ${response.status}`,
      response.status,
      url,
      text.slice(0, 600),
    );
  }

  return (await response.json()) as T;
}

function collectMissingGitHubAppFields(): string[] {
  const missing: string[] = [];
  if (!(process.env.GITHUB_APP_ID || "").trim()) {
    missing.push("GITHUB_APP_ID");
  }
  if (!readPrivateKeyPem()) {
    missing.push("GITHUB_APP_PRIVATE_KEY");
  }
  return missing;
}

function readPrivateKeyPem(): string | null {
  const inline = (process.env.GITHUB_APP_PRIVATE_KEY || "").trim();
  if (inline) {
    return inline.replace(/\\n/g, "\n");
  }

  const base64 = (process.env.GITHUB_APP_PRIVATE_KEY_BASE64 || "").trim();
  if (!base64) return null;
  try {
    return Buffer.from(base64, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function readWebhookSecret(): string | null {
  const value = (process.env.GITHUB_APP_WEBHOOK_SECRET || "").trim();
  return value || null;
}

function readOwnerHint(): string | null {
  const value = (process.env.GITHUB_APP_OWNER || "").trim();
  return value || null;
}

function readInstallationIdHint(): number | null {
  const value = (process.env.GITHUB_APP_INSTALLATION_ID || "").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function base64urlJson(value: unknown): string {
  return base64url(Buffer.from(JSON.stringify(value), "utf8"));
}

function base64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildGitHubHeaders(authorization: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: authorization,
    "User-Agent": "devin-dashboard/0.1 github-app-broker",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function normalizeRepositories(value: unknown): GitHubInstallationRepository[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      id: asNumber(entry.id) || 0,
      name: asString(entry.name) || "",
      fullName: asString(entry.full_name) || "",
      private: typeof entry.private === "boolean" ? entry.private : null,
      defaultBranch: asString(entry.default_branch),
    }))
    .filter((entry) => Boolean(entry.fullName));
}

function normalizePermissions(
  value: Record<string, unknown> | null,
): GitHubAppPermissions {
  if (!value) return {};
  const out: GitHubAppPermissions = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === "read" || raw === "write") {
      out[key] = raw;
    }
  }
  return out;
}
