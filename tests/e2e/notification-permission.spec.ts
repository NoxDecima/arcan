import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * E2E: Slice 8 notification permission flow + sound toggle round-trip.
 *
 * Retargeted for Unit 9-5b: the settings notifications UI is now two kit
 * Toggle sliders (role="switch" + aria-checked) instead of a checkbox +
 * Enable/Disable buttons. The permission flow itself is unchanged.
 *
 * Three scenarios:
 *   1. Permission pre-granted via Playwright context → flip browser slider →
 *      notifications.browser flips true, slider shows checked.
 *   2. Permission denied (forced via init script) → inline error appears;
 *      slider stays unchecked.
 *   3. Sound slider: boolean round-trips through reload.
 */

test.describe("Slice 8 — notification permission flow", () => {
  test("granted permission flips notifications.browser true", async ({
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

      const slider = page.getByRole("switch", { name: "browser notifications" });
      await expect(slider).toBeVisible({ timeout: 10_000 });
      await expect(slider).not.toBeChecked();
      await slider.click();

      // granted → slider reflects the real permission → checked.
      await expect(slider).toBeChecked({ timeout: 10_000 });
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

      const slider = page.getByRole("switch", { name: "browser notifications" });
      await expect(slider).toBeVisible({ timeout: 10_000 });
      await slider.click();

      await expect(page.getByTestId("browser-error")).toBeVisible({
        timeout: 10_000,
      });
      // Slider stays unchecked.
      await expect(slider).not.toBeChecked();
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

      const toggle = page.getByRole("switch", { name: "sound on new messages" });
      await expect(toggle).toBeVisible({ timeout: 10_000 });
      await expect(toggle).not.toBeChecked();

      await toggle.click();
      await expect(toggle).toBeChecked();

      // Reload + verify the bit persisted in settings.notifications.sound.
      await page.reload();
      await expect(
        page.getByRole("switch", { name: "sound on new messages" }),
      ).toBeChecked({
        timeout: 15_000,
      });
    } finally {
      await ctx.close();
    }
  });
});
