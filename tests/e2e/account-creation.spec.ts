import { test, expect } from "@playwright/test";
import { capturePassphraseWords } from "./helpers";

/**
 * E2E: Full account creation flow.
 *
 * Walks the complete onboarding path:
 *   welcome → passphrase display → passphrase confirm → profile → home
 *
 * The passphrase confirm step presents 3 random words from the phrase; we
 * read the label to determine which 1-based word number each slot requests,
 * then look it up in the captured words array.
 */
test("account creation flow", async ({ page }) => {
  // 1. Navigate to welcome screen
  await page.goto("/");

  // 2. Assert welcome heading visible
  await expect(page.getByRole("heading", { name: /Welcome to Jazz Messanger/i })).toBeVisible();

  // 3. Click "Create new account"
  await page.getByTestId("create-account-btn").click();

  // 4. Capture 24 words from the passphrase grid
  const words = await capturePassphraseWords(page);
  expect(words).toHaveLength(24);
  // Sanity: all words are non-empty strings
  for (const word of words) {
    expect(word.trim().length).toBeGreaterThan(0);
  }

  // 5. Check the "I have saved my passphrase" checkbox
  await page.getByTestId("passphrase-saved-checkbox").check();

  // 6. Click Continue to passphrase confirm step
  await page.getByTestId("passphrase-display-continue").click();

  // 7. Fill in each of the 3 confirm inputs by reading the label for which word is requested
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

  // 8. Click Confirm
  await page.getByTestId("confirm-passphrase-btn").click();

  // 9. Fill display name
  await page.getByTestId("display-name-input").fill("Test User");

  // 10. Click Finish (creates the account)
  await page.getByTestId("finish-onboarding-btn").click();

  // 11. Home screen should appear (timeout 10s for Jazz initialization)
  await expect(page.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });

  // 12. Sidebar should show the display name
  await expect(page.getByTestId("sidebar-display-name")).toHaveText("Test User");
});
