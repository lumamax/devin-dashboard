import { strict as assert } from "node:assert";
import { test } from "node:test";

test("parseEventPayload flattens NDJSON arrays and objects", async () => {
  const { parseEventPayload } = await import("../src/lib/devinControlPlane.ts");
  const payload = [
    JSON.stringify([
      { type: "status_update", event_id: "e-1", enum: "running", timestamp: "2026-05-16T08:00:00Z" },
      { type: "devin_message", event_id: "e-2", message: "Started working" },
    ]),
    JSON.stringify({ items: [{ type: "user_message", event_id: "e-3", message: "continue" }] }),
  ].join("\n");

  const events = parseEventPayload(payload);
  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((event) => event.type),
    ["status_update", "devin_message", "user_message"],
  );
});

test("parseEventPayload also understands single JSON payloads with result arrays", async () => {
  const { parseEventPayload } = await import("../src/lib/devinControlPlane.ts");
  const payload = JSON.stringify({
    result: [
      { type: "status_update", event_id: "e-1", enum: "working", message: "Thinking" },
      { type: "devin_message", event_id: "e-2", message: "PR opened" },
    ],
  });

  const events = parseEventPayload(payload);
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => event.type),
    ["status_update", "devin_message"],
  );
});

test("summarizeSessionEventFeed keeps the latest message and todo counts readable", async () => {
  const { summarizeSessionEventFeed } = await import("../src/lib/devinControlPlane.ts");
  const payload = [
    JSON.stringify({ type: "status_update", event_id: "e-1", enum: "blocked", message: "Waiting for your response" }),
    JSON.stringify({ type: "devin_thoughts", event_id: "e-2", message: "Checking the repository" }),
    JSON.stringify({ type: "todo_update", event_id: "e-3", completed_count: 1, in_progress_count: 1, pending_count: 2 }),
    JSON.stringify({ type: "shell_process_started", event_id: "e-4", command: ["npm", "test"] }),
    JSON.stringify({ type: "devin_message", event_id: "e-5", message: "I found the bug in auth flow." }),
    JSON.stringify({ type: "user_message", event_id: "e-6", message: "continue" }),
  ].join("\n");

  const summary = summarizeSessionEventFeed(payload, 4);
  assert.equal(summary.totalItems, 6);
  assert.equal(summary.counts.devin_message, 1);
  assert.equal(summary.latestStatus?.status, "blocked");
  assert.equal(summary.latestDevinMessage?.message, "I found the bug in auth flow.");
  assert.equal(summary.latestTodoUpdate?.pendingCount, 2);
  assert.equal(summary.latestCommands[0]?.command, "npm test");
  assert.equal(summary.items.length, 4);
});

test("extractSessionRows and normalizeSessionSummary understand Devin v2sessions payloads", async () => {
  const { extractSessionRows, normalizeSessionSummary } = await import("../src/lib/devinControlPlane.ts");

  const payload = {
    result: [
      {
        devin_id: "devin-5637758699044b14a6a92c99f9ce08d7",
        title: "OmniRoute Devin провайдеры cookie токены",
        status: "suspended",
        activity_status: "pr",
        current_activity: "executing_actions",
        max_acu_limit: 10,
        session_origin: "webapp",
        is_archived: false,
        created_at: "2026-05-14T20:27:36.584954+00:00",
        updated_at: "2026-05-15T22:46:01.113628+00:00",
        tags: ["agent-preview:devin-opus-4-7", "agent:devin-rs"],
        latest_status_contents: {
          enum: "finished",
          type: "status_update",
          reason: "out_of_quota",
          message: "Session suspended",
          timestamp: "2026-05-15T22:45:28.864614+00:00",
          user_action_required: null,
        },
      },
    ],
  };

  const rows = extractSessionRows(payload);
  assert.equal(rows.length, 1);

  const session = normalizeSessionSummary(rows[0]!);
  assert.equal(session.devinId, "devin-5637758699044b14a6a92c99f9ce08d7");
  assert.equal(session.title, "OmniRoute Devin провайдеры cookie токены");
  assert.equal(session.latestStatus?.enum, "finished");
  assert.equal(session.latestStatus?.message, "Session suspended");
});
