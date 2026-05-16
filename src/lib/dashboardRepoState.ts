type JsonRecord = Record<string, unknown>;

export type DashboardRepoAssignment = {
  owner: string;
  repo: string;
  branch: string;
  fullName: string;
  updatedAt: string | null;
};

export type PreparedRepoRecord = {
  repoFullName: string;
  branch: string | null;
  sessionId: string | null;
  mode: "attach-only";
  updatedAt: string | null;
};

export function buildRepoAssignment(
  owner: string,
  repo: string,
  branch: string,
  updatedAt = new Date().toISOString(),
): DashboardRepoAssignment {
  return {
    owner,
    repo,
    branch,
    fullName: `${owner}/${repo}`,
    updatedAt,
  };
}

export function readDashboardState(providerSpecificData: JsonRecord | null): JsonRecord {
  const dashboard = providerSpecificData?.devinDashboard;
  if (!dashboard || typeof dashboard !== "object" || Array.isArray(dashboard)) {
    return {};
  }
  return dashboard as JsonRecord;
}

export function readRepoAssignment(
  providerSpecificData: JsonRecord | null,
): DashboardRepoAssignment | null {
  const dashboard = readDashboardState(providerSpecificData);
  const repoAssignment = dashboard.repoAssignment;
  if (!repoAssignment || typeof repoAssignment !== "object" || Array.isArray(repoAssignment)) {
    return null;
  }

  const record = repoAssignment as JsonRecord;
  const owner = typeof record.owner === "string" ? record.owner.trim() : "";
  const repo = typeof record.repo === "string" ? record.repo.trim() : "";
  const fullName = typeof record.fullName === "string" && record.fullName.trim()
    ? record.fullName.trim()
    : owner && repo
      ? `${owner}/${repo}`
      : "";
  const branch = typeof record.branch === "string" && record.branch.trim()
    ? record.branch.trim()
    : null;
  const updatedAt = typeof record.updatedAt === "string" && record.updatedAt.trim()
    ? record.updatedAt.trim()
    : null;

  if (!fullName || !owner || !repo) {
    const parts = fullName.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return null;
    }
    return {
      owner: parts[0],
      repo: parts[1],
      branch: branch || "main",
      fullName,
      updatedAt,
    };
  }

  return {
    owner,
    repo,
    branch: branch || "main",
    fullName,
    updatedAt,
  };
}

export function readPreparedRepos(
  providerSpecificData: JsonRecord | null,
): PreparedRepoRecord[] {
  const dashboard = readDashboardState(providerSpecificData);
  const repoAssignment = readRepoAssignment(providerSpecificData);
  const preparedRepos = Array.isArray(dashboard.preparedRepos)
    ? dashboard.preparedRepos
        .map((value) => normalizePreparedRepo(value, repoAssignment))
        .filter((value): value is PreparedRepoRecord => value !== null)
    : [];

  if (preparedRepos.length > 0) {
    return dedupePreparedRepos(preparedRepos);
  }

  const legacyPrepared = normalizePreparedRepo(dashboard.preparedSession, repoAssignment);
  return legacyPrepared ? [legacyPrepared] : [];
}

export function findPreparedRepo(
  providerSpecificData: JsonRecord | null,
  repoFullName: string,
): PreparedRepoRecord | null {
  const needle = repoFullName.trim().toLowerCase();
  if (!needle) return null;
  return readPreparedRepos(providerSpecificData).find(
    (record) => record.repoFullName.toLowerCase() === needle,
  ) || null;
}

export function mergePreparedRepoState(
  providerSpecificData: JsonRecord | null,
  repoAssignment: DashboardRepoAssignment,
  preparedRepo?: PreparedRepoRecord,
): Record<string, unknown> {
  const dashboard = readDashboardState(providerSpecificData);
  const preparedRepos = preparedRepo
    ? dedupePreparedRepos([preparedRepo, ...readPreparedRepos(providerSpecificData)])
    : readPreparedRepos(providerSpecificData);

  return {
    ...(providerSpecificData || {}),
    devinDashboard: {
      ...dashboard,
      repoAssignment,
      ...(preparedRepos.length > 0 ? { preparedRepos } : {}),
      ...(preparedRepo ? { preparedSession: preparedRepo } : {}),
    },
  };
}

function normalizePreparedRepo(
  value: unknown,
  fallbackAssignment: DashboardRepoAssignment | null,
): PreparedRepoRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as JsonRecord;
  const repoFullName = typeof record.repoFullName === "string" && record.repoFullName.trim()
    ? record.repoFullName.trim()
    : fallbackAssignment?.fullName || "";
  if (!repoFullName) {
    return null;
  }

  const branch = typeof record.branch === "string" && record.branch.trim()
    ? record.branch.trim()
    : fallbackAssignment?.branch || null;
  const sessionId = typeof record.sessionId === "string" && record.sessionId.trim()
    ? record.sessionId.trim()
    : null;
  const updatedAt = typeof record.updatedAt === "string" && record.updatedAt.trim()
    ? record.updatedAt.trim()
    : fallbackAssignment?.updatedAt || null;

  return {
    repoFullName,
    branch,
    sessionId,
    mode: "attach-only",
    updatedAt,
  };
}

function dedupePreparedRepos(records: PreparedRepoRecord[]): PreparedRepoRecord[] {
  const map = new Map<string, PreparedRepoRecord>();

  for (const record of records) {
    const key = record.repoFullName.toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, record);
      continue;
    }

    if (toTimestamp(record.updatedAt) >= toTimestamp(existing.updatedAt)) {
      map.set(key, record);
    }
  }

  return Array.from(map.values()).sort(
    (left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt),
  );
}

function toTimestamp(value: string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}
