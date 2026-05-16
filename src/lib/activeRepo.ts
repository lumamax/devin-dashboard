export type ActiveRepoSelection = {
  owner: string;
  repo: string;
  branch: string;
};

export const ACTIVE_REPO_STORAGE_KEY = "devin-dashboard.active-repo.v1";
export const ACTIVE_REPO_EVENT = "devin-dashboard:active-repo";

export function parseActiveRepo(raw: string | null | undefined): ActiveRepoSelection | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveRepoSelection>;
    if (
      typeof parsed.owner !== "string" ||
      typeof parsed.repo !== "string" ||
      typeof parsed.branch !== "string"
    ) {
      return null;
    }

    const owner = parsed.owner.trim();
    const repo = parsed.repo.trim();
    const branch = parsed.branch.trim() || "main";
    if (!owner || !repo) return null;

    return { owner, repo, branch };
  } catch {
    return null;
  }
}

export function getActiveRepoSelection(): ActiveRepoSelection | null {
  if (typeof window === "undefined") return null;
  return parseActiveRepo(window.localStorage.getItem(ACTIVE_REPO_STORAGE_KEY));
}

export function emitActiveRepoSelection(selection: ActiveRepoSelection): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ActiveRepoSelection>(ACTIVE_REPO_EVENT, { detail: selection }));
}

export function saveActiveRepoSelection(selection: ActiveRepoSelection): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_REPO_STORAGE_KEY, JSON.stringify(selection));
  emitActiveRepoSelection(selection);
}

export function formatActiveRepoLabel(selection: ActiveRepoSelection): string {
  return `${selection.owner}/${selection.repo}`;
}
