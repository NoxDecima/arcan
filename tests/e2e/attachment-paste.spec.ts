// tests/e2e/attachment-paste.spec.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.resolve(__dirname, "fixtures/tiny.png");

test("paste an image from clipboard adds it to the tray", async ({ browser, browserName }) => {
  // Firefox's synthetic ClipboardEvent does not deliver constructed DataTransfer
  // files to onPaste listeners; this test verifies the composer handler shape
  // and is reliably driven only via Chromium.
  test.skip(browserName === "firefox", "Firefox synthetic ClipboardEvent files unreachable");
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  try {
    await pageA.goto("/");
    await createAccount(pageA, "Alice");
    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    await establishContact(pageB, pageA, "Bob");

    await openDirectChat(pageA, "Bob");

    // Build a ClipboardEvent in the page and dispatch on the textarea
    const pngBytes = fs.readFileSync(PNG);
    const pngB64 = pngBytes.toString("base64");

    await pageA.evaluate(async (b64) => {
      const arr = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const file = new File([arr], "pasted.png", { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const textarea = document.querySelector('[data-testid="composer-input"]') as HTMLTextAreaElement;
      textarea.focus();
      const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
      textarea.dispatchEvent(ev);
    }, pngB64);

    await expect(pageA.getByTestId("composer-attachment-tray-item")).toHaveCount(1);
    await pageA.getByTestId("composer-send-btn").click();

    const aliceConvUrl = pageA.url();
    await pageB.goto(aliceConvUrl);
    await expect(pageB.getByTestId("attachment-tile-sent-image").first()).toBeVisible({ timeout: 15_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
