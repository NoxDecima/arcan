import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * E2E for Unit 9-5b settings controls + feedback.
 *
 * The kit Toggle (9-5a) renders `role="switch"` + `aria-checked` and accepts an
 * `aria-label`, but no `data-testid`. So the slider toggles are targeted via
 * `getByRole("switch", { name })` rather than a test id, and asserted with
 * Playwright's `toBeChecked()` (which reads `aria-checked` for the switch role).
 */
test.describe("Unit 9-5b — settings controls + feedback", () => {
  test("browser-notification slider flips on when permission is granted", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ permissions: ["notifications"] });
    const page = await ctx.newPage();
    try {
      await page.goto("/");
      await createAccount(page, "Alice");
      await page.goto("/settings");

      const slider = page.getByRole("switch", { name: "browser notifications" });
      await expect(slider).toBeVisible({ timeout: 10_000 });
      // starts off
      await expect(slider).not.toBeChecked();
      await slider.click();
      // granted → reflects real permission → on
      await expect(slider).toBeChecked({ timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  test("browser-notification slider stays off when permission is denied", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.addInitScript(() => {
        if (typeof (globalThis as any).Notification !== "undefined") {
          (globalThis as any).Notification.requestPermission = () =>
            Promise.resolve("denied");
        }
      });
      await page.goto("/");
      await createAccount(page, "Bob");
      await page.goto("/settings");

      const slider = page.getByRole("switch", { name: "browser notifications" });
      await slider.click();
      await expect(slider).not.toBeChecked();
      await expect(page.getByTestId("browser-error")).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test("sound slider round-trips through reload", async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto("/");
      await createAccount(page, "Cara");
      await page.goto("/settings");
      const sound = page.getByRole("switch", { name: "sound on new messages" });
      await expect(sound).not.toBeChecked();
      await sound.click();
      await expect(sound).toBeChecked();
      await page.reload();
      await expect(
        page.getByRole("switch", { name: "sound on new messages" }),
      ).toBeChecked({ timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });
});
