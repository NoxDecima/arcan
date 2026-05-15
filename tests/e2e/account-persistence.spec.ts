import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * E2E: Account persists across browser reload.
 *
 * After completing account creation the user reloads the page. Jazz stores
 * credentials in IndexedDB, so the account should be automatically restored
 * and the user should land directly on the home screen without re-onboarding.
 */
test("account persists across browser reload", async ({ page }) => {
  // 1. Start at the welcome screen and create an account
  await page.goto("/");
  const { displayName } = await createAccount(page, "Persistent User");

  // Sanity: we are on home
  await expect(page.getByTestId("home-main")).toBeVisible();

  // 2. Reload the page (simulates closing and reopening the tab in the same browser)
  await page.reload();

  // 3. Should land back on home — not on the onboarding welcome screen
  await expect(page.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });

  // 4. Sidebar should still show the original display name
  await expect(page.getByTestId("sidebar-display-name")).toHaveText(displayName);
});
