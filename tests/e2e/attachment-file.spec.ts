// tests/e2e/attachment-file.spec.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF = path.resolve(__dirname, "fixtures/tiny.pdf");

test("non-image attachment renders as a file tile in Bob's bubble", async ({ browser }) => {
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

    await pageA.setInputFiles('[data-testid="composer-file-input"]', PDF);
    await pageA.getByTestId("composer-send-btn").click();

    const aliceConvUrl = pageA.url();
    await pageB.goto(aliceConvUrl);
    await expect(pageB.getByTestId("attachment-tile-sent-file")).toBeVisible({
      timeout: 15_000,
    });
    await expect(pageB.getByTestId("attachment-tile-sent-file")).toContainText("tiny.pdf");
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
