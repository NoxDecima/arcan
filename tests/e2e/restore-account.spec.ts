import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * E2E: Restore an account on a fresh browser context via passphrase.
 *
 * Context A creates the account and captures the passphrase.
 * Context B starts with empty IndexedDB — it must go through the restore
 * flow instead of auto-loading from stored credentials.
 *
 * This uses the `browser` fixture so we can open two fully isolated contexts.
 */
test("restore account on fresh browser context via passphrase", async ({
  browser,
}) => {
  // ------------------------------------------------------------------ Context A
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();

  await pageA.goto("/");
  const { phrase, displayName } = await createAccount(pageA, "Restore Test User");

  // Verify we are on home in context A before closing it
  await expect(pageA.getByTestId("home-main")).toBeVisible();

  await contextA.close();

  // ------------------------------------------------------------------ Context B
  // Fresh context — no cookies, no IndexedDB carry-over
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();

  try {
    // 1. Navigate to the welcome screen (should appear because no credentials exist)
    await pageB.goto("/");
    await expect(
      pageB.getByRole("heading", { name: /Welcome to Jazz Messanger/i }),
    ).toBeVisible({ timeout: 10_000 });

    // 2. Click "Restore account from passphrase"
    await pageB.getByTestId("restore-account-btn").click();

    // 3. Fill in the captured passphrase
    await pageB.getByTestId("restore-passphrase-input").fill(phrase);

    // 4. Click Restore
    await pageB.getByTestId("restore-btn").click();

    // 5. Should land on home
    await expect(pageB.getByTestId("home-main")).toBeVisible({ timeout: 15_000 });

    // 6. Sidebar should show the same display name as the original account
    await expect(pageB.getByTestId("sidebar-display-name")).toHaveText(displayName);
  } finally {
    await contextB.close();
  }
});
