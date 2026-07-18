import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

// UI motion spec (2026-07-18): route swaps go through
// document.startViewTransition (src/nav/transitions.ts). This pins the
// integration: navigation must complete and land on the right screen with
// the View Transitions API ACTIVE (Chromium ships it), and the direction
// attribute must be cleaned up after the transition settles.
test.describe("screen transitions", () => {
  test("navigation completes and cleans up with view transitions enabled", async ({
    page,
  }) => {
    // Register error collectors BEFORE account creation so we catch any
    // console errors that occur during the full onboarding flow.
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    await createAccount(page, "Motion Nav");

    // Guard the premise: if this ever flips, the suite silently stops
    // testing the VT path — fail loudly instead.
    expect(
      await page.evaluate(() => typeof document.startViewTransition),
    ).toBe("function");

    // Drill in: home → own profile (forward), then up: profile → settings
    // (back) — the exact chain back-navigation.spec.ts already exercises.
    // Navigation chain verified against:
    //   - tests/e2e/back-navigation.spec.ts (same selectors)
    //   - src/nav/parents.ts: /profile/:id with ownProfile=true → /settings
    await page.goto("/?tab=contacts");
    await page.getByTestId("sidebar-header-profile").click();
    await expect(page.getByTestId("profile-view")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId("profile-back").click();
    await expect(page).toHaveURL(/\/settings$/);

    // data-nav-dir is stamped only DURING a transition; once settled it must
    // be gone (finished-promise cleanup in useTransitionedLocation).
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.dataset.navDir ?? "none"),
      )
      .toBe("none");

    // No console errors or unhandled rejections should have occurred during
    // account creation or navigation (catches React flushSync warnings and
    // unhandled rejections in the VT path).
    expect(consoleErrors).toEqual([]);
  });
});
