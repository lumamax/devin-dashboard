import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { launchChrome, LauncherError, resolveProfileDir, DEVIN_WEB_URL } = await import(
  "../src/lib/launcher.ts"
);

test("resolveProfileDir rejects unsafe connection ids", () => {
  assert.throws(
    () => resolveProfileDir("../escape"),
    (err: unknown) => err instanceof LauncherError && err.code === "invalid_connection_id"
  );
});

test("launchChrome refuses non-http(s) URLs", () => {
  assert.throws(
    () =>
      launchChrome({
        connectionId: "test-conn",
        binaryPath: "/bin/true",
        url: "file:///etc/passwd",
      }),
    (err: unknown) => err instanceof LauncherError && err.code === "invalid_url"
  );
});

test("launchChrome rejects nonexistent override binaries", () => {
  assert.throws(
    () =>
      launchChrome({
        connectionId: "test-conn",
        binaryPath: "/definitely/not/here/xyzzy",
      }),
    (err: unknown) => err instanceof LauncherError && err.code === "browser_not_found"
  );
});

test("launchChrome creates a per-connection profile and detaches the child", () => {
  const isWindows = process.platform === "win32";
  const noopBinary = isWindows ? "C:\\Windows\\System32\\cmd.exe" : "/bin/true";
  if (!existsSync(noopBinary)) return;

  const profileRoot = mkdtempSync(path.join(tmpdir(), "devin-dashboard-test-"));
  try {
    const result = launchChrome({
      connectionId: "conn-abc",
      binaryPath: noopBinary,
      profileRoot,
    });
    assert.equal(result.ok, true);
    assert.equal(result.url, DEVIN_WEB_URL);
    assert.equal(result.binaryPath, noopBinary);
    assert.equal(typeof result.pid, "number");
    assert.equal(path.dirname(result.profileDir), profileRoot);
    assert.equal(path.basename(result.profileDir), "conn-abc");
    assert.ok(existsSync(result.profileDir));
  } finally {
    rmSync(profileRoot, { recursive: true, force: true });
  }
});
