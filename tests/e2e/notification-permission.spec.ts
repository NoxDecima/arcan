import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * E2E: Slice 8 notification permission flow + sound toggle round-trip.
 *
 * Three scenarios:
 *   1. Permission pre-granted via Playwright context → click "Enable" →
 *      notificationPrefs.browser flips true, UI shows "Enabled" + Disable button.
 *   2. Permission denied (forced via Object.defineProperty in-page) →
 *      inline error appears; status stays "Not enabled".
 *   3. Sound toggle: simple boolean checkbox round-trips through reload.
 */

test.describe("Slice 8 — notification permission flow", () => {
  test("granted permission flips notificationPrefs.browser true", async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    const ctx = await browser.newContext({
      permissions: ["notifications"], // pre-grant
    });
    const page = await ctx.newPage();
    try {
      await page.goto("/");
      await createAccount(page, "Alice");
      await page.goto("/settings");

      await expect(page.getByTestId("enable-browser-notifications")).toBeVisible({
        timeout: 10_000,
      });
      await page.getByTestId("enable-browser-notifications").click();

      // Status flips to "Enabled" + the button switches to Disable.
      await expect(page.getByTestId("browser-status")).toHaveText("enabled", {
        timeout: 10_000,
      });
      await expect(
        page.getByTestId("disable-browser-notifications"),
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("denied permission shows inline error", async ({ browser }) => {
    test.setTimeout(120_000);

    // Force Notification.requestPermission to resolve "denied" so the
    // component takes the "Notifications were declined" branch
    // deterministically — independent of Playwright's actual permission
    // grant for the context.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      // addInitScript runs in every navigated frame BEFORE app code, so the
      // override is in place when the settings page calls requestPermission.
      await page.addInitScript(() => {
        if (typeof (globalThis as any).Notification !== "undefined") {
          (globalThis as any).Notification.requestPermission = async () =>
            "denied" as NotificationPermission;
        }
      });

      await page.goto("/");
      await createAccount(page, "Alice");
      await page.goto("/settings");
      await expect(page.getByTestId("enable-browser-notifications")).toBeVisible({
        timeout: 10_000,
      });
      await page.getByTestId("enable-browser-notifications").click();

      await expect(page.getByTestId("browser-error")).toBeVisible({
        timeout: 10_000,
      });
      // Status stays "Not enabled".
      await expect(page.getByTestId("browser-status")).toHaveText("not enabled");
    } finally {
      await ctx.close();
    }
  });

  test("sound toggle round-trips through reload", async ({ browser }) => {
    test.setTimeout(120_000);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto("/");
      await createAccount(page, "Alice");
      await page.goto("/settings");

      const toggle = page.getByTestId("sound-toggle");
      await expect(toggle).toBeVisible({ timeout: 10_000 });
      await expect(toggle).not.toBeChecked();

      await toggle.click();
      await expect(toggle).toBeChecked();

      // Reload + verify the bit persisted in me.root.notificationPrefs.sound.
      await page.reload();
      await expect(page.getByTestId("sound-toggle")).toBeChecked({
        timeout: 15_000,
      });
    } finally {
      await ctx.close();
    }
  });
});
