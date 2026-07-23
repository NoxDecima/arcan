import { test, expect } from "@playwright/test";
import {
  createAccount,
  establishContact,
  openDirectChat,
} from "./helpers";

/**
 * E2E for the per-device UI scale (appearance iteration 2026-07-23).
 *
 * - Persistence: the pill writes localStorage `arcan-ui-scale` and applies
 *   CSS zoom on <html> immediately; a reload re-applies it pre-paint.
 * - Anchoring: the message menu portals to document.body with position:fixed;
 *   under zoom its coords are divided by the factor (Task-5 fix). Both boxes
 *   are measured with boundingBox() (same coordinate space), so the
 *   assertions hold regardless of engine zoom semantics.
 * - VT smoke: an SPA navigation at 130% completes (pane transition doesn't
 *   wedge). Visual slide quality is a manual check (plan Task 8).
 */
test.describe("UI scale", () => {
  test("scale pill persists across reload and applies html zoom", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/");
    await createAccount(page, "Alice");
    await page.goto("/settings");

    await page.getByTestId("ui-scale-130").click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.zoom))
      .toBe("1.3");
    expect(
      await page.evaluate(() => localStorage.getItem("arcan-ui-scale")),
    ).toBe("130");

    await page.reload();
    await expect(page.getByTestId("settings-body")).toBeVisible({
      timeout: 15_000,
    });
    // Re-applied pre-paint from storage.
    expect(
      await page.evaluate(() => document.documentElement.style.zoom),
    ).toBe("1.3");
    // Pill reflects the stored step.
    await expect(page.getByTestId("ui-scale-130")).toHaveClass(
      /bg-arcan-accent-fill/,
    );

    // Back to 100% clears the zoom property entirely.
    await page.getByTestId("ui-scale-100").click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.zoom))
      .toBe("");
  });

  test("message menu anchors to its trigger at 130%", async ({ browser }) => {
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
      await pageA.getByTestId("composer-input").fill("scale probe");
      await pageA.getByTestId("composer-send-btn").click();
      await expect(pageA.getByTestId("message-mine")).toBeVisible();

      // Switch this device to 130% and reload into the conversation.
      await pageA.evaluate(() =>
        localStorage.setItem("arcan-ui-scale", "130"),
      );
      await pageA.reload();
      await expect(pageA.getByTestId("conversation-detail")).toBeVisible({
        timeout: 15_000,
      });
      expect(
        await pageA.evaluate(() => document.documentElement.style.zoom),
      ).toBe("1.3");

      await pageA.getByTestId("message-mine").first().hover();
      const trigger = pageA.getByTestId("message-menu-btn").first();
      const tBox = (await trigger.boundingBox())!;
      await trigger.click();
      const menu = pageA.getByTestId("message-menu");
      await expect(menu).toBeVisible();
      const mBox = (await menu.boundingBox())!;

      // Vertically adjacent: 4px gap (×1.3 zoom ≈ 5.2) below the trigger, or
      // flipped above it near the viewport bottom. Allow rounding slack.
      const below = mBox.y - (tBox.y + tBox.height);
      const above = tBox.y - (mBox.y + mBox.height);
      const vGap = mBox.y >= tBox.y + tBox.height ? below : above;
      expect(vGap).toBeGreaterThanOrEqual(0);
      expect(vGap).toBeLessThanOrEqual(10);
      // Horizontally attached to the trigger (menu opens at the trigger's
      // left edge, or right-aligned to it when clamped at the viewport edge).
      expect(tBox.x).toBeGreaterThanOrEqual(mBox.x - 8);
      expect(tBox.x).toBeLessThanOrEqual(mBox.x + mBox.width + 8);
      // Fully inside the viewport (the clamp math survived the zoom).
      const vp = pageA.viewportSize()!;
      expect(mBox.x).toBeGreaterThanOrEqual(0);
      expect(mBox.y).toBeGreaterThanOrEqual(0);
      expect(mBox.x + mBox.width).toBeLessThanOrEqual(vp.width + 1);
      expect(mBox.y + mBox.height).toBeLessThanOrEqual(vp.height + 1);

      // Functional proof: the items are hit-testable where they render.
      await pageA.getByTestId("message-edit-btn").click();
      await expect(pageA.getByTestId("message-edit-input")).toBeVisible();
      await pageA.keyboard.press("Escape");

      // VT-at-zoom smoke: an SPA navigation (chat → info pane) completes.
      // For a 1:1 conversation the members route redirects to the other
      // participant's profile-view (src/routes/conversations/members.tsx:268);
      // the transition still fires — we just await the actual landing screen.
      await pageA.getByTestId("conversation-header-link").click();
      await expect(
        pageA.locator('[data-testid="members-route"],[data-testid="profile-view"]'),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
