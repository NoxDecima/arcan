// tests/e2e/attachment-paste.spec.ts
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

const PNG = path.resolve(__dirname, "fixtures/tiny.png");

test("paste an image from clipboard adds it to the tray", async ({ browser }) => {
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

    await pageB.goto("/contacts/add");
    await expect(pageB.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();
    await pageA.goto(inviteUrl);
    await pageA.getByTestId("invite-accept-btn").click();
    await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 10_000 });
    await expect(pageB.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });

    await pageA.goto("/contacts");
    await pageA.getByTestId("contacts-page-row-0").click();
    await pageA.getByTestId("start-chat-btn").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });

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
