// tests/e2e/profile-avatar.spec.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { createAccount, establishContact } from "./helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
    await establishContact(pageB, pageA, "Bob");

    // Alice uploads her avatar from her own profile (Unit 9: avatar editing
    // moved off the settings page onto the polymorphic profile route).
    await pageA.goto("/conversations");
    await pageA.getByTestId("sidebar-header-profile").click();
    await expect(pageA.getByTestId("profile-view")).toBeVisible({ timeout: 10_000 });
    await pageA.setInputFiles('[data-testid="profile-avatar-input"]', PNG);

    // Avatar img tag appears within the profile-avatar container
    await expect(
      pageA.getByTestId("profile-avatar").locator("img"),
    ).toBeVisible({ timeout: 10_000 });

    // Sidebar header shows the avatar img
    await pageA.goto("/conversations");
    await expect(
      pageA.getByTestId("sidebar-avatar").locator("img"),
    ).toBeVisible({ timeout: 10_000 });

    // Bob navigates to contacts and sees Alice's avatar in her contact row
    await pageB.goto("/?tab=contacts");
    await expect(pageB.getByTestId("sidebar-contacts-list")).toContainText("Alice", {
      timeout: 15_000,
    });
    await expect(
      pageB.getByTestId("sidebar-contact-row-0").locator("img"),
    ).toBeVisible({ timeout: 30_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
