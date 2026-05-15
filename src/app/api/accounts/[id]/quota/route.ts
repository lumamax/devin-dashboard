/**
 * GET /api/accounts/[id]/quota — live quota for a stored Devin account.
 *
 * Pulls quota + billing status from app.devin.ai with the connection's
 * captured Bearer + cookie and enriches the response with a compact model
 * summary for the dashboard.
 */

import { NextResponse } from "next/server";
import { devinGet } from "@/lib/devinApi";
import {
  getStoredAccount,
  MissingConfigError,
  updateAccountCreds,
} from "@/lib/connectionStore";

const KNOWN_MODEL_TAGS = [
  { tag: "agent-preview:devin-opus-4-7", label: "Opus 4.7" },
  { tag: "agent-preview:devin-gpt-5-5", label: "GPT-5.5" },
  { tag: "agent-preview:devin-fast-opus", label: "Fast" },
  { tag: "agent-preview:devin_lite", label: "Lite" },
  { tag: "agent-preview:devin", label: "Devin" },
] as const;

type JsonRecord = Record<string, unknown>;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const account = await getStoredAccount(id).catch((err) => {
    throw new Error(`Failed to read account ${id}: ${(err as Error).message}`);
  });
  if (!account) {
    return NextResponse.json({ ok: false, error: "Account not found" }, { status: 404 });
  }
  if (!account.creds) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This account has no structured credentials yet (legacy cookie format). Click 'Re-link' to capture a fresh Bearer + orgId via login.",
        code: "needs_relink",
      },
      { status: 409 }
    );
  }

  const onRefresh = async (next: typeof account.creds) => {
    if (!next) return;
    try {
      await updateAccountCreds(id, next);
    } catch (error) {
      if (error instanceof MissingConfigError) {
        return;
      }
      throw error;
    }
  };
  const orgId = account.creds.orgId;
  if (!orgId) {
    return NextResponse.json(
      { ok: false, error: "Stored credentials are missing orgId", code: "needs_relink" },
      { status: 409 }
    );
  }

  const [usage, status, sessionTags, userInfo] = await Promise.all([
    devinGet<JsonRecord>(`/api/${orgId}/billing/quota/usage`, account.creds, onRefresh),
    devinGet<JsonRecord>(`/api/${orgId}/billing/status`, account.creds, onRefresh),
    devinGet<JsonRecord>(`/api/organizations/${orgId}/session-tags`, account.creds, onRefresh),
    devinGet<JsonRecord>(`/api/users/info`, account.creds, onRefresh),
  ]);

  return NextResponse.json({
    ok: true,
    usage: usage.ok ? usage.data : { error: usage.error.message, status: usage.error.status },
    status: status.ok ? status.data : { error: status.error.message, status: status.error.status },
    models: deriveModels(sessionTags.ok ? sessionTags.data : null, userInfo.ok ? userInfo.data : null),
  });
}

function deriveModels(sessionTags: JsonRecord | null, userInfo: JsonRecord | null) {
  const enabledTags = new Set<string>();

  for (const tag of readStringArray(sessionTags?.tags)) {
    enabledTags.add(tag);
  }

  const defaultTag = readString(sessionTags, ["default_tag"]);
  if (defaultTag) {
    enabledTags.add(defaultTag);
  }

  const override = normalizeModelTag(readString(userInfo, ["default_devin_version_override"]));
  if (override) {
    enabledTags.add(override);
  }

  const knownModels = (enabledTags.size === 0
    ? KNOWN_MODEL_TAGS.filter((model) => model.tag !== "agent-preview:devin")
    : KNOWN_MODEL_TAGS.filter((model) => enabledTags.has(model.tag)))
    .map((model) => ({ id: model.tag, label: model.label }));

  const extraModels = Array.from(enabledTags)
    .filter((tag) => !KNOWN_MODEL_TAGS.some((model) => model.tag === tag))
    .map((tag) => ({ id: tag, label: humanizeModelTag(tag) }));

  return dedupeModels([...knownModels, ...extraModels]);
}

function normalizeModelTag(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("agent-preview:") || value.startsWith("model:")) return value;
  if (value.startsWith("devin-")) return `agent-preview:${value}`;
  return `model:${value}`;
}

function humanizeModelTag(tag: string): string {
  const cleaned = tag.replace(/^agent-preview:/, "").replace(/^model:/, "");
  const known = KNOWN_MODEL_TAGS.find((model) => model.tag === tag);
  if (known) return known.label;
  return cleaned
    .replace(/^devin[-_]/, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => (part.toUpperCase() === part ? part : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

function dedupeModels(models: Array<{ id: string; label: string }>) {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (!model.id || seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

function readString(obj: JsonRecord | null | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}
