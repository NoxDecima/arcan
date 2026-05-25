// tests/e2e/attachment-image.spec.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.resolve(__dirname, "fixtures/tiny.png");

test("image attachment: Alice sends a PNG, Bob sees it + lightbox opens", async ({ browser }) => {
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

    // Establish contact
    await pageB.goto("/contacts/add");
    await expect(pageB.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();
    await pageA.goto(inviteUrl);
    await pageA.getByTestId("invite-accept-btn").click();
    await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 10_000 });
    await expect(pageB.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });

    // Start chat
    await pageA.goto("/contacts");
    await pageA.getByTestId("contacts-page-row-0").click();
    await pageA.getByTestId("start-chat-btn").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });

    // Attach + send
    await pageA.setInputFiles('[data-testid="composer-file-input"]', PNG);
    await expect(
      pageA.getByTestId("composer-attachment-tray-item"),
    ).toHaveCount(1);
    await pageA.getByTestId("composer-send-btn").click();

    // Bob sees the image
    const aliceConvUrl = pageA.url();
    await pageB.goto(aliceConvUrl);
    await expect(pageB.getByTestId("conversation-detail")).toBeVisible({ timeout: 15_000 });
    await expect(
      pageB.getByTestId("attachment-tile-sent-image").first(),
    ).toBeVisible({ timeout: 15_000 });

    // Open lightbox in Bob's view
    await pageB.getByTestId("attachment-tile-sent-image").first().click();
    await expect(pageB.getByTestId("image-lightbox")).toBeVisible();
    await pageB.getByTestId("image-lightbox-close").click();
    await expect(pageB.getByTestId("image-lightbox")).not.toBeVisible();
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
