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

  test("devices card shows the link-device row at the bottom and it navigates to pairing", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto("/");
      await createAccount(page, "Dana");
      await page.goto("/settings");

      const card = page.getByTestId("devices-card");
      await expect(card).toBeVisible({ timeout: 10_000 });

      // The link row is the last child row of the card.
      const linkRow = page.getByTestId("link-device-row");
      await expect(linkRow).toBeVisible();
      // It is positioned after the (at least one) device row in DOM order.
      const deviceRow = page.getByTestId("device-row-0");
      await expect(deviceRow).toBeVisible();
      const order = await card.evaluate((el) => {
        const ids = Array.from(el.querySelectorAll("[data-testid]")).map(
          (n) => (n as HTMLElement).dataset.testid,
        );
        return {
          device: ids.indexOf("device-row-0"),
          link: ids.indexOf("link-device-row"),
        };
      });
      expect(order.link).toBeGreaterThan(order.device);

      await linkRow.click();
      await expect(page).toHaveURL(/\/pair\?role=initiator/);
    } finally {
      await ctx.close();
    }
  });

  test("feedback row opens the route, submits, and returns to settings", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      // Stub the feedback API so the test doesn't depend on Linear.
      await page.route("**/api/feedback", (route) =>
        route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) }),
      );
      await page.goto("/");
      await createAccount(page, "Eve");
      await page.goto("/settings");

      await page.getByTestId("feedback-row").click();
      await expect(page).toHaveURL(/\/settings\/feedback$/);
      await expect(page.getByTestId("feedback-submit")).toBeDisabled();

      await page.getByTestId("feedback-message").fill("the safety-number flow is slick");
      await page.getByTestId("feedback-category-idea").click();
      await expect(page.getByTestId("feedback-submit")).toBeEnabled();

      await page.getByTestId("feedback-submit").click();
      // Success toast + return to /settings.
      await expect(page).toHaveURL(/\/settings$/, { timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });
});
