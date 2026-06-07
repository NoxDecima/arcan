import { test, expect } from "@playwright/test";
import { captureRecoveryCode, freshCredentials } from "./helpers";

/**
 * E2E: Full account creation flow.
 *
 * Walks the complete onboarding path:
 *   welcome → credentials → backup-display → backup-confirm → profile → home
 *
 * The backup-confirm step presents 3 random words from the recovery code; we
 * read the label to determine which 1-based word number each slot requests,
 * then look it up in the captured words array.
 */
test("account creation flow", async ({ page }) => {
  const creds = freshCredentials("creation");

  // 1. Navigate directly to /onboarding (the unauthenticated root now points
  //    at /auth/login; "Create new account" link routes to /onboarding).
  await page.goto("/onboarding");

  // 2. Assert welcome heading visible
  await expect(
    page.getByRole("heading", { name: /Welcome to Arcan/i }),
  ).toBeVisible();

  // 3. Click "Create new account"
  await page.getByTestId("create-account-btn").click();

  // 4. Fill credentials step (email + password)
  await page.getByTestId("credentials-email").fill(creds.email);
  await page.getByTestId("credentials-password").fill(creds.password);
  await page.getByTestId("credentials-confirm").fill(creds.password);
  await page.getByTestId("credentials-continue").click();

  // 5. Capture 24 words from the backup-display grid
  const words = await captureRecoveryCode(page);
  expect(words).toHaveLength(24);
  // Sanity: all words are non-empty strings
  for (const word of words) {
    expect(word.trim().length).toBeGreaterThan(0);
  }

  // 6. Check the "I have saved my recovery code" checkbox
  await page.getByTestId("passphrase-saved-checkbox").check();

  // 7. Click Continue to backup-confirm step
  await page.getByTestId("passphrase-display-continue").click();

  // 8. Fill in each of the 3 confirm inputs by reading the label for which word is requested
  for (let slot = 0; slot < 3; slot++) {
    const label = page.locator(`label[for="confirm-word-${slot}"]`);
    const labelText = (await label.textContent()) ?? "";
    // Label text is "Word N" (1-based index)
    const match = labelText.match(/Word\s+(\d+)/);
    expect(match, `confirm label slot ${slot} should contain "Word N"`).toBeTruthy();
    const wordNumber = parseInt(match![1], 10);
    const expectedWord = words[wordNumber - 1];
    await page.getByTestId(`confirm-word-${slot}`).fill(expectedWord);
  }

  // 9. Click Confirm
  await page.getByTestId("confirm-passphrase-btn").click();

  // 10. Fill display name
  await page.getByTestId("display-name-input").fill("Test User");

  // 11. Click Finish (creates the account via auth-server + Jazz)
  await page.getByTestId("finish-onboarding-btn").click();

  // 12. Home screen should appear (Jazz init + auth-server signup takes a moment)
  await expect(page.getByTestId("home-main")).toBeVisible({ timeout: 20_000 });

  // 13. Sidebar should show the display name
  await expect(page.getByTestId("sidebar-display-name")).toHaveText("Test User");
});
