// tests/e2e/attachment-image.spec.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

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
    await establishContact(pageB, pageA, "Bob");

    // Start chat
    await openDirectChat(pageA, "Bob");

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

    // Download button triggers a real browser download with the original
    // filename (#58: routed through the platform capability — web path is the
    // programmatic anchor; the shell path is device-checklist territory).
    const downloadPromise = pageB.waitForEvent("download");
    await pageB.getByTestId("image-lightbox-download").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("tiny.png");
    // The download click must not close the lightbox.
    await expect(pageB.getByTestId("image-lightbox")).toBeVisible();

    await pageB.getByTestId("image-lightbox-close").click();
    await expect(pageB.getByTestId("image-lightbox")).not.toBeVisible();

    // #59: a live 1:1 with Bob now exists — revisiting his profile flips the
    // CTA from "create conversation" to "open conversation".
    await pageA.goto("/?tab=contacts");
    const contactsA = pageA.getByTestId("sidebar-contacts-list");
    await expect(contactsA).toContainText("Bob", { timeout: 15_000 });
    await contactsA.getByText("Bob", { exact: false }).first().click();
    await expect(pageA.getByTestId("profile-message")).toContainText(
      "open conversation",
      { timeout: 10_000 },
    );
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
