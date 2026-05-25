// tests/e2e/profile-avatar.spec.ts
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

const PNG = path.resolve(__dirname, "fixtures/tiny.png");

test("avatar uploaded in settings appears in sidebar + Bob's contacts list after sync", async ({ browser }) => {
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

    // Establish contact (Bob invites, Alice accepts)
    await pageB.goto("/contacts/add");
    await expect(pageB.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();
    await pageA.goto(inviteUrl);
    await pageA.getByTestId("invite-accept-btn").click();
    await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 10_000 });
    await expect(pageB.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });

    // Alice uploads her avatar in settings
    await pageA.goto("/settings");
    await pageA.setInputFiles('[data-testid="settings-avatar-input"]', PNG);

    // Avatar img tag appears within the settings-avatar container
    await expect(
      pageA.getByTestId("settings-avatar").locator("img"),
    ).toBeVisible({ timeout: 10_000 });

    // Sidebar header shows the avatar img
    await pageA.goto("/conversations");
    await expect(
      pageA.getByTestId("sidebar-avatar").locator("img"),
    ).toBeVisible({ timeout: 10_000 });

    // Bob navigates to contacts and sees Alice's avatar in her contact row
    await pageB.goto("/contacts");
    await expect(pageB.getByTestId("contacts-page-list")).toContainText("Alice", {
      timeout: 15_000,
    });
    await expect(
      pageB.getByTestId("contacts-page-row-0").locator("img"),
    ).toBeVisible({ timeout: 30_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
