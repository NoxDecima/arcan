import { Page } from "@playwright/test";

/**
 * From a page that has a `qr-url-text` element (pairing initiator or contact
 * add), extract the URL displayed in the QR code text.
 */
export async function getPairingUrl(page: Page): Promise<string> {
  const url = await page.getByTestId("qr-url-text").textContent();
  if (!url) throw new Error("Could not read pairing URL");
  return url.trim();
}

/**
 * Captures the 24-word passphrase from the passphrase-display step.
 *
 * The grid (`data-testid="passphrase-grid"`) contains 24 child divs.
 * Each child div has two spans: "{i+1}." and the word itself.
 * We extract only the word text (second span).
 */
export async function capturePassphraseWords(page: Page): Promise<string[]> {
  const wordDivs = page.locator('[data-testid="passphrase-grid"] > div');
  const count = await wordDivs.count();
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    // Each div has two spans: "N." and the word. Grab the second span.
    const wordSpan = wordDivs.nth(i).locator("span").nth(1);
    words.push((await wordSpan.textContent()) ?? "");
  }
  return words;
}

/**
 * Walks the onboarding form steps up to and including clicking "Finish",
 * but does NOT wait for home-main. Useful when the caller expects a
 * post-registration redirect (e.g. invite replay) that navigates away
 * before home-main ever renders.
 *
 * Returns the passphrase words and display name for downstream assertions.
 */
export async function fillOnboardingForm(
  page: Page,
  displayName = "Test User",
): Promise<{ phrase: string; displayName: string }> {
  // Welcome step
  await page.getByTestId("create-account-btn").click();

  // Passphrase display step — capture words before acknowledging
  const words = await capturePassphraseWords(page);
  await page.getByTestId("passphrase-saved-checkbox").check();
  await page.getByTestId("passphrase-display-continue").click();

  // Passphrase confirm step — read each label to find which word index is needed
  for (let slot = 0; slot < 3; slot++) {
    const label = page.locator(`label[for="confirm-word-${slot}"]`);
    const labelText = (await label.textContent()) ?? "";
    // Label text is "Word N" where N is 1-based
    const match = labelText.match(/Word\s+(\d+)/);
    if (!match) throw new Error(`Could not parse confirm label: "${labelText}"`);
    const wordNumber = parseInt(match[1], 10); // 1-based
    const expectedWord = words[wordNumber - 1];
    await page.getByTestId(`confirm-word-${slot}`).fill(expectedWord);
  }
  await page.getByTestId("confirm-passphrase-btn").click();

  // Profile step
  await page.getByTestId("display-name-input").fill(displayName);
  await page.getByTestId("finish-onboarding-btn").click();

  return { phrase: words.join(" "), displayName };
}

/**
 * Completes the full account creation flow starting from the welcome screen.
 *
 * Precondition: page is at `/` (welcome step visible).
 * Postcondition: page is on the home screen (`home-main` visible).
 *
 * Returns the 24-word passphrase string (space-joined) and the display name
 * used, so callers can verify persistence / restore.
 */
export async function createAccount(
  page: Page,
  displayName = "Test User",
): Promise<{ phrase: string; displayName: string }> {
  const result = await fillOnboardingForm(page, displayName);

  // Wait for home — Jazz initialization can take a few seconds
  await page.getByTestId("home-main").waitFor({ timeout: 15_000 });

  return result;
}
