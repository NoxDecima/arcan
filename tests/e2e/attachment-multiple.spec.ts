// tests/e2e/attachment-multiple.spec.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.resolve(__dirname, "fixtures/tiny.png");
const PDF = path.resolve(__dirname, "fixtures/tiny.pdf");

test("multiple attachments in one message", async ({ browser }) => {
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

    await pageA.setInputFiles('[data-testid="composer-file-input"]', [PNG, PDF]);
    await expect(pageA.getByTestId("composer-attachment-tray-item")).toHaveCount(2);
    await pageA.getByTestId("composer-send-btn").click();

    const aliceConvUrl = pageA.url();
    await pageB.goto(aliceConvUrl);
    await expect(pageB.getByTestId("conversation-detail")).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByTestId("attachment-tile-sent-image").first()).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByTestId("attachment-tile-sent-file")).toContainText("tiny.pdf");
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
