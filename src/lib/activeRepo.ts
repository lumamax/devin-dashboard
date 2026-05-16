export type ActiveRepoSelection = {
  owner: string;
  repo: string;
  branch: string;
};

export type ActiveRepoModel = {
  id: string;
  label: string;
  availabilityTag?: string;
};

export const ACTIVE_REPO_STORAGE_KEY = "devin-dashboard.active-repo.v1";
export const ACTIVE_REPO_EVENT = "devin-dashboard:active-repo";
export const ACTIVE_REPO_MODEL_STORAGE_KEY = "devin-dashboard.active-model.v1";
export const ACTIVE_REPO_MODEL_EVENT = "devin-dashboard:active-model";

export const ACTIVE_REPO_MODEL_OPTIONS: ActiveRepoModel[] = [
  {
    id: "devin-opus-4-7",
    label: "Opus 4.7",
    availabilityTag: "agent-preview:devin-opus-4-7",
  },
  {
    id: "devin-gpt-5-5",
    label: "GPT-5.5",
    availabilityTag: "agent-preview:devin-gpt-5-5",
  },
  {
    id: "devin-fast-opus",
    label: "Fast",
    availabilityTag: "agent-preview:devin-fast-opus",
  },
  {
    id: "devin_lite",
    label: "Lite",
    availabilityTag: "agent-preview:devin_lite",
  },
];

export const DEFAULT_ACTIVE_REPO_MODEL = ACTIVE_REPO_MODEL_OPTIONS[0]!;

export function parseActiveRepo(raw: string | null | undefined): ActiveRepoSelection | null {
  return parseActiveRepos(raw)[0] || null;
}

export function parseActiveRepos(raw: string | null | undefined): ActiveRepoSelection[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return dedupeSelections(
        parsed
          .map((item) => normalizeSelection(item))
          .filter((item): item is ActiveRepoSelection => item !== null),
      );
    }

    const single = normalizeSelection(parsed);
    return single ? [single] : [];
  } catch {
    return [];
  }
}

export function getActiveRepoSelection(): ActiveRepoSelection | null {
  return getActiveRepoSelections()[0] || null;
}

export function getActiveRepoSelections(): ActiveRepoSelection[] {
  if (typeof window === "undefined") return [];
  return parseActiveRepos(window.localStorage.getItem(ACTIVE_REPO_STORAGE_KEY));
}

export function parseActiveRepoModel(raw: string | null | undefined): ActiveRepoModel {
  if (!raw) return DEFAULT_ACTIVE_REPO_MODEL;

  try {
    const parsed = normalizeModel(JSON.parse(raw));
    return parsed || DEFAULT_ACTIVE_REPO_MODEL;
  } catch {
    return DEFAULT_ACTIVE_REPO_MODEL;
  }
}

export function getActiveRepoModel(): ActiveRepoModel {
  if (typeof window === "undefined") return DEFAULT_ACTIVE_REPO_MODEL;
  return parseActiveRepoModel(window.localStorage.getItem(ACTIVE_REPO_MODEL_STORAGE_KEY));
}

export function emitActiveRepoSelection(selection: ActiveRepoSelection): void {
  emitActiveRepoSelections([selection]);
}

export function emitActiveRepoSelections(selections: ActiveRepoSelection[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ActiveRepoSelection[]>(ACTIVE_REPO_EVENT, {
      detail: dedupeSelections(selections),
    }),
  );
}

export function emitActiveRepoModel(model: ActiveRepoModel): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ActiveRepoModel>(ACTIVE_REPO_MODEL_EVENT, {
      detail: normalizeModel(model) || DEFAULT_ACTIVE_REPO_MODEL,
    }),
  );
}

export function saveActiveRepoSelection(selection: ActiveRepoSelection): void {
  saveActiveRepoSelections([selection]);
}

export function saveActiveRepoSelections(selections: ActiveRepoSelection[]): void {
  if (typeof window === "undefined") return;
  const normalized = dedupeSelections(selections);
  window.localStorage.setItem(ACTIVE_REPO_STORAGE_KEY, JSON.stringify(normalized));
  emitActiveRepoSelections(normalized);
}

export function saveActiveRepoModel(model: ActiveRepoModel): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeModel(model) || DEFAULT_ACTIVE_REPO_MODEL;
  window.localStorage.setItem(ACTIVE_REPO_MODEL_STORAGE_KEY, JSON.stringify(normalized));
  emitActiveRepoModel(normalized);
}

export function formatActiveRepoLabel(selection: ActiveRepoSelection): string {
  return `${selection.owner}/${selection.repo}`;
}

function normalizeSelection(value: unknown): ActiveRepoSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const parsed = value as Partial<ActiveRepoSelection>;
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
}

function normalizeModel(value: unknown): ActiveRepoModel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const parsed = value as Partial<ActiveRepoModel>;
  if (typeof parsed.id !== "string" || typeof parsed.label !== "string") {
    return null;
  }

  const id = parsed.id.trim();
  const label = parsed.label.trim();
  if (!id || !label) return null;

  const known = ACTIVE_REPO_MODEL_OPTIONS.find((option) => option.id === id);
  if (known) return known;

  return {
    id,
    label,
    availabilityTag:
      typeof parsed.availabilityTag === "string" && parsed.availabilityTag.trim()
        ? parsed.availabilityTag.trim()
        : undefined,
  };
}

function dedupeSelections(selections: ActiveRepoSelection[]): ActiveRepoSelection[] {
  const seen = new Set<string>();
  const out: ActiveRepoSelection[] = [];

  for (const selection of selections) {
    const key = `${selection.owner.toLowerCase()}/${selection.repo.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      owner: selection.owner.trim(),
      repo: selection.repo.trim(),
      branch: selection.branch.trim() || "main",
    });
  }

  return out;
}
