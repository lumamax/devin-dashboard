import test from "node:test";
import assert from "node:assert/strict";

const { buildComposerInjectionScript, buildDevinLaunchUrl, parseExistingDebugPortFromPs } = await import(
  "../src/lib/devinSessionSeeder.ts"
);

test("buildDevinLaunchUrl tags the Devin page with a launch token", () => {
  const url = buildDevinLaunchUrl("abc123");
  assert.match(url, /^https:\/\/app\.devin\.ai\//);
  assert.match(url, /devin_dashboard_launch=abc123/);
});

test("buildComposerInjectionScript safely embeds multiline prompt text", () => {
  const prompt = `line 1\nline "2"\nline 3`;
  const script = buildComposerInjectionScript(prompt);
  assert.match(script, /line \\"2\\"/);
  assert.match(script, /replace\(\/\\s\+\/g, " "\)/);
  assert.match(script, /composer_not_found/);
  assert.match(script, /clicked_send/);
});

test("parseExistingDebugPortFromPs reuses an existing debug port for the same user-data-dir", () => {
  const psOutput = [
    '94763 /Applications/Google Chrome --user-data-dir=/tmp/devin-a --remote-debugging-port=52968 https://app.devin.ai/',
    '94769 /Applications/Google Chrome Helper --type=renderer --user-data-dir=/tmp/devin-a --remote-debugging-port=52968',
    '95000 /Applications/Google Chrome --user-data-dir=/tmp/devin-b --remote-debugging-port=53001 https://app.devin.ai/',
  ].join("\n");

  assert.equal(parseExistingDebugPortFromPs(psOutput, "/tmp/devin-a"), 52968);
  assert.equal(parseExistingDebugPortFromPs(psOutput, "/tmp/devin-b"), 53001);
  assert.equal(parseExistingDebugPortFromPs(psOutput, "/tmp/missing"), null);
});
