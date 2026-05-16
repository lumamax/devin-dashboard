import type { DevinSessionSummary } from "@/lib/devinControlPlane";

const TERMINAL_STATUSES = new Set([
  "suspended",
  "finished",
  "failed",
  "cancelled",
  "canceled",
  "completed",
  "deleted",
  "archived",
]);

export type RepoAttachDecision =
  | { action: "start-new" }
  | {
      action: "reuse";
      reason: "stored_prepared_session" | "matching_repo_session";
      session: DevinSessionSummary;
    }
  | {
      action: "blocked";
      reason: "account_already_has_live_session";
      session: DevinSessionSummary;
    };

export function isLiveDevinSession(session: Pick<DevinSessionSummary, "status" | "isArchived">): boolean {
  if (session.isArchived) return false;
  const normalized = String(session.status || "").trim().toLowerCase();
  if (!normalized) return true;
  return !TERMINAL_STATUSES.has(normalized);
}

export function sessionLooksPreparedForRepo(
  session: Pick<DevinSessionSummary, "title" | "tags">,
  repoFullName: string,
): boolean {
  const needle = repoFullName.trim().toLowerCase();
  if (!needle) return false;

  const haystack = [session.title || "", ...(session.tags || [])]
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

export function decideRepoAttachSession(options: {
  targetRepoFullName: string;
  sessions: DevinSessionSummary[];
  lastPreparedSessionId?: string | null;
}): RepoAttachDecision {
  const liveSessions = options.sessions.filter((session) => isLiveDevinSession(session));

  if (options.lastPreparedSessionId) {
    const stored = liveSessions.find((session) => session.devinId === options.lastPreparedSessionId);
    if (stored) {
      return {
        action: "reuse",
        reason: "stored_prepared_session",
        session: stored,
      };
    }
  }

  const matchingRepo = liveSessions.find((session) =>
    sessionLooksPreparedForRepo(session, options.targetRepoFullName),
  );
  if (matchingRepo) {
    return {
      action: "reuse",
      reason: "matching_repo_session",
      session: matchingRepo,
    };
  }

  if (liveSessions.length > 0) {
    return {
      action: "blocked",
      reason: "account_already_has_live_session",
      session: liveSessions[0],
    };
  }

  return { action: "start-new" };
}
