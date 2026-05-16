import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import CDP from "chrome-remote-interface";
import { DEVIN_WEB_URL } from "@/lib/launcher";

export type DevinSeedResult = {
  attempted: boolean;
  ok: boolean;
  method: "cdp";
  reason: string | null;
  action?: string | null;
  pageUrl?: string | null;
};

type SeedPromptOptions = {
  chromePort: number;
  prompt: string;
  launchToken?: string;
  targetUrlIncludes?: string[];
  timeoutMs?: number;
};

export type SeedPromptToSessionOptions = {
  chromePort: number;
  prompt: string;
  sessionId: string;
  timeoutMs?: number;
};

type CdpTarget = {
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
};

type ComposeResult = {
  ok?: boolean;
  reason?: string;
  action?: string;
};

export function buildDevinLaunchUrl(launchToken: string): string {
  const url = new URL(DEVIN_WEB_URL);
  url.searchParams.set("devin_dashboard_launch", launchToken);
  return url.toString();
}

export function buildDevinSessionWebUrl(sessionId: string): string {
  const normalized = sessionId.replace(/^devin-/, "");
  return `https://app.devin.ai/sessions/${normalized}`;
}

export async function findFreeDebugPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close();
        reject(new Error("Failed to allocate free debug port"));
      }
    });
  });
}
export function findExistingDebugPort(userDataDir: string): number | null {
  try {
    const output = execFileSync("ps", ["-axo", "pid=,command="], {
      encoding: "utf8",
    });
    return parseExistingDebugPortFromPs(output, userDataDir);
  } catch {
    return null;
  }
}

export function parseExistingDebugPortFromPs(
  psOutput: string,
  userDataDir: string,
): number | null {
  const marker = `--user-data-dir=${userDataDir}`;

  for (const line of psOutput.split(/\n+/)) {
    if (!line.includes(marker)) continue;
    if (line.includes(" --type=")) continue;

    const match = line.match(/--remote-debugging-port=(\d+)/);
    if (!match) continue;

    const port = Number(match[1]);
    if (Number.isFinite(port) && port > 0) {
      return port;
    }
  }

  return null;
}


export function buildComposerInjectionScript(prompt: string): string {
  return `(() => {
    const prompt = ${JSON.stringify(prompt)};
    const normalize = (value) => String(value || "").toLowerCase().replace(/\\s+/g, " ").trim();
    const matchesAny = (value, patterns) => patterns.some((pattern) => value.includes(pattern));
    const isVisible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const scoreTextbox = (element) => {
      let score = 0;
      const meta = normalize([
        element.getAttribute("placeholder"),
        element.getAttribute("aria-label"),
        element.getAttribute("name"),
        element.getAttribute("data-testid"),
        element.getAttribute("role"),
      ].filter(Boolean).join(" "));
      if (matchesAny(meta, ["message", "prompt", "ask", "chat", "devin", "instruction"])) score += 10;
      if (element.tagName === "TEXTAREA") score += 8;
      if (element.getAttribute("contenteditable") === "true") score += 7;
      if (element.getAttribute("role") === "textbox") score += 6;
      if (element.disabled || element.getAttribute("aria-disabled") === "true" || element.readOnly) score -= 100;
      const rect = element.getBoundingClientRect();
      if (rect.width > 220) score += 3;
      if (rect.bottom > window.innerHeight * 0.4) score += 2;
      return score;
    };
    const findTextbox = () => {
      const devinBox = document.querySelector('[data-devin-input-box="true"]');
      if (devinBox && isVisible(devinBox)) {
        return devinBox;
      }

      const candidates = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"], input[type="text"]'))
        .filter(isVisible)
        .map((element) => ({ element, score: scoreTextbox(element) }))
        .sort((left, right) => right.score - left.score);
      return candidates[0]?.element || null;
    };
    const clickComposerOpener = () => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], a[role="button"]')).filter(isVisible);
      const openerPatterns = [
        "new session",
        "start session",
        "new chat",
        "start chat",
        "message devin",
        "chat with devin",
        "ask devin",
      ];
      for (const button of buttons) {
        const label = normalize(button.innerText || button.textContent || button.getAttribute("aria-label") || button.getAttribute("title"));
        if (matchesAny(label, openerPatterns)) {
          button.click();
          return true;
        }
      }
      return false;
    };
    const setElementValue = (element, value) => {
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        if (descriptor && descriptor.set) {
          descriptor.set.call(element, value);
        } else {
          element.value = value;
        }
        element.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }

      if (element.getAttribute("contenteditable") === "true") {
        if (typeof document.execCommand === "function") {
          element.focus();
          const selected = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(element);
          range.collapse(false);
          selected?.removeAllRanges();
          selected?.addRange(range);
          if (document.execCommand("insertText", false, value)) {
            element.dispatchEvent(new Event("input", { bubbles: true }));
            return;
          }
        }

        element.textContent = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    const findSendButton = () => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).filter(isVisible);
      const sendPatterns = ["send", "start session", "run", "submit"];
      for (const button of buttons) {
        const label = normalize(button.innerText || button.textContent || button.getAttribute("aria-label") || button.getAttribute("title") || button.getAttribute("value"));
        if (matchesAny(label, sendPatterns) || button.getAttribute("type") === "submit") {
          const disabled = button.disabled || button.getAttribute("aria-disabled") === "true";
          if (!disabled) return button;
        }
      }
      return null;
    };

    const pageText = normalize(document.body?.innerText || "");
    if (pageText.includes("no seat allocated")) {
      return { ok: false, reason: "no_seat_allocated" };
    }

    const textbox = findTextbox();
    if (!textbox) {
      return { ok: false, reason: clickComposerOpener() ? "opened_composer" : "composer_not_found" };
    }

    textbox.focus();
    setElementValue(textbox, prompt);

    const sendButton = findSendButton();
    if (sendButton) {
      sendButton.click();
      return { ok: true, action: "clicked_send" };
    }

    const form = textbox.closest("form");
    if (form && typeof form.requestSubmit === "function") {
      form.requestSubmit();
      return { ok: true, action: "submitted_form" };
    }

    if (pageText.includes("select repositories")) {
      return { ok: false, reason: "repository_selection_required" };
    }

    return { ok: false, reason: "send_button_not_found" };
  })();`;
}

export async function seedPromptViaCdp(options: SeedPromptOptions): Promise<DevinSeedResult> {
  return seedPromptViaCdpInternal(options);
}

export async function seedPromptViaCdpToSession(
  options: SeedPromptToSessionOptions,
): Promise<DevinSeedResult> {
  return seedPromptViaCdpInternal({
    chromePort: options.chromePort,
    prompt: options.prompt,
    timeoutMs: options.timeoutMs,
    targetUrlIncludes: [buildDevinSessionWebUrl(options.sessionId)],
  });
}

async function seedPromptViaCdpInternal(options: SeedPromptOptions): Promise<DevinSeedResult> {
  const timeoutMs = options.timeoutMs ?? 25000;
  let client: CDP.Client | null = null;
  let pageUrl: string | null = null;
  let lastReason = "target_not_found";

  try {
    const target = await waitForTarget(
      options.chromePort,
      options.launchToken,
      timeoutMs,
      options.targetUrlIncludes,
    );
    if (!target.webSocketDebuggerUrl) {
      return {
        attempted: true,
        ok: false,
        method: "cdp",
        reason: "target_missing_websocket",
        pageUrl: target.url || null,
      };
    }

    pageUrl = target.url || null;
    client = await CDP({ target: target.webSocketDebuggerUrl });
    const { Page, Runtime } = client;
    await Promise.allSettled([Page.enable(), Runtime.enable()]);
    await Page.bringToFront().catch(() => undefined);
    await sleep(6000);

    const deadline = Date.now() + timeoutMs;
    const expression = buildComposerInjectionScript(options.prompt);

    while (Date.now() < deadline) {
      const probe = await Runtime.evaluate({
        expression: `(() => ({
          ready: document.readyState,
          pageText: String(document.body?.innerText || "").toLowerCase(),
          hasTextbox: Boolean(document.querySelector('[data-devin-input-box="true"], textarea, [role="textbox"], [contenteditable="true"], input[type="text"]')),
        }))()`,
        returnByValue: true,
        awaitPromise: true,
      }).catch((error: unknown) => {
        lastReason = error instanceof Error ? error.message : String(error);
        return null;
      });

      const probeValue = (probe?.result?.value || null) as {
        ready?: string;
        pageText?: string;
        hasTextbox?: boolean;
      } | null;

      if (probeValue?.pageText?.includes("no seat allocated")) {
        return {
          attempted: true,
          ok: false,
          method: "cdp",
          reason: "no_seat_allocated",
          pageUrl,
        };
      }

      if (probeValue?.ready !== "complete") {
        await sleep(700);
        continue;
      }

      const result = await Runtime.evaluate({
        expression,
        returnByValue: true,
        awaitPromise: true,
      }).catch((error: unknown) => {
        lastReason = error instanceof Error ? error.message : String(error);
        return null;
      });

      const value = (result?.result?.value || null) as ComposeResult | null;
      if (value?.ok) {
        return {
          attempted: true,
          ok: true,
          method: "cdp",
          reason: null,
          action: value.action || null,
          pageUrl,
        };
      }

      if (value?.reason) {
        lastReason = value.reason;
      }

      await sleep(700);
    }

    return {
      attempted: true,
      ok: false,
      method: "cdp",
      reason: lastReason,
      pageUrl,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      method: "cdp",
      reason: error instanceof Error ? error.message : String(error),
      pageUrl,
    };
  } finally {
    try {
      await client?.close();
    } catch {
      // ignore close errors
    }
  }
}

async function waitForTarget(
  chromePort: number,
  launchToken: string | undefined,
  timeoutMs: number,
  targetUrlIncludes: string[] | undefined,
): Promise<CdpTarget> {
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      const targets = (await CDP.List({ port: chromePort })) as CdpTarget[];
      const pages = targets.filter((target) => target.type === "page");
      if (targetUrlIncludes && targetUrlIncludes.length > 0) {
        const preferred = pages.find((target) =>
          targetUrlIncludes.some((fragment) => (target.url || "").includes(fragment)),
        );
        if (preferred) {
          return preferred;
        }
      }
      if (launchToken) {
        const preferred = pages.find((target) =>
          (target.url || "").includes(`devin_dashboard_launch=${launchToken}`),
        );
        if (preferred) {
          return preferred;
        }
      } else {
        const devinPage = pages.find((target) =>
          (target.url || "").includes("app.devin.ai"),
        );
        if (devinPage) {
          return devinPage;
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    await sleep(500);
  }

  throw new Error(lastError?.message || `Could not find Devin page on Chrome debug port ${chromePort}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
