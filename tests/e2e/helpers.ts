import { Page } from "@playwright/test";

export type AccountCredentials = {
  email: string;
  username: string;
  password: string;
};

/**
 * Generate unique-per-test credentials so concurrent e2e specs don't collide
 * on email/username uniqueness in the auth-server DB.
 */
export function freshCredentials(prefix = "alice"): AccountCredentials {
  const id = Math.random().toString(36).slice(2, 10);
  return {
    email: `${prefix}-${id}@example.com`,
    username: `${prefix}_${id}`,
    password: `correcthorsebattery${id}!`,
  };
}

/** Capture the 24-word recovery code from the backup-display step. */
export async function captureRecoveryCode(page: Page): Promise<string[]> {
  const wordDivs = page.locator('[data-testid="passphrase-grid"] > div');
  const count = await wordDivs.count();
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    const wordSpan = wordDivs.nth(i).locator("span").nth(1);
    words.push((await wordSpan.textContent()) ?? "");
  }
  return words;
}

/**
 * Walks the new onboarding flow: welcome → credentials → backup-display →
 * backup-confirm → profile → Finish.
 *
 * Precondition: page is at `/` (auth.login screen visible — but onboarding
 * lives at `/onboarding`; helper navigates there explicitly).
 *
 * Returns the captured recovery code + the credentials used so callers can
 * verify sign-in / recovery behavior.
 */
export async function createAccount(
  page: Page,
  displayName = "Test User",
  credentials: AccountCredentials = freshCredentials(),
): Promise<{
  credentials: AccountCredentials;
  recoveryCode: string;
  displayName: string;
}> {
  await page.goto("/onboarding");
  await page.getByTestId("create-account-btn").click();

  // Credentials step
  await page.getByTestId("credentials-email").fill(credentials.email);
  await page.getByTestId("credentials-username").fill(credentials.username);
  await page.getByTestId("credentials-password").fill(credentials.password);
  await page.getByTestId("credentials-confirm").fill(credentials.password);
  await page.getByTestId("credentials-continue").click();

  // Backup display
  const words = await captureRecoveryCode(page);
  await page.getByTestId("passphrase-saved-checkbox").check();
  await page.getByTestId("passphrase-display-continue").click();

  // Backup confirm (3 challenge words by label)
  for (let slot = 0; slot < 3; slot++) {
    const label = page.locator(`label[for="confirm-word-${slot}"]`);
    const labelText = (await label.textContent()) ?? "";
    const match = labelText.match(/Word\s+(\d+)/);
    if (!match) throw new Error(`Could not parse confirm label: "${labelText}"`);
    const expected = words[parseInt(match[1], 10) - 1];
    await page.getByTestId(`confirm-word-${slot}`).fill(expected);
  }
  await page.getByTestId("confirm-passphrase-btn").click();

  // Profile
  await page.getByTestId("display-name-input").fill(displayName);
  await page.getByTestId("finish-onboarding-btn").click();

  // Wait for home
  await page.getByTestId("home-main").waitFor({ timeout: 20_000 });

  // Settle: give Jazz a moment to fully persist the auth state to localStorage
  // + IndexedDB before the caller potentially reloads. Without this, on a
  // very fast machine reload can race the persist and Jazz starts up
  // anonymous instead of restoring the just-created account.
  await page.waitForTimeout(1500);

  return { credentials, recoveryCode: words.join(" "), displayName };
}

/**
 * Walks the new onboarding flow up to and including clicking "Finish",
 * but does NOT wait for home-main. Useful when the caller expects a
 * post-registration redirect (e.g. invite replay) that navigates away
 * before home-main ever renders.
 *
 * Returns the captured recovery code + the credentials used.
 */
export async function fillOnboardingForm(
  page: Page,
  displayName = "Test User",
  credentials: AccountCredentials = freshCredentials(),
): Promise<{
  credentials: AccountCredentials;
  recoveryCode: string;
  displayName: string;
}> {
  await page.goto("/onboarding");
  await page.getByTestId("create-account-btn").click();

  // Credentials step
  await page.getByTestId("credentials-email").fill(credentials.email);
  await page.getByTestId("credentials-username").fill(credentials.username);
  await page.getByTestId("credentials-password").fill(credentials.password);
  await page.getByTestId("credentials-confirm").fill(credentials.password);
  await page.getByTestId("credentials-continue").click();

  // Backup display
  const words = await captureRecoveryCode(page);
  await page.getByTestId("passphrase-saved-checkbox").check();
  await page.getByTestId("passphrase-display-continue").click();

  // Backup confirm
  for (let slot = 0; slot < 3; slot++) {
    const label = page.locator(`label[for="confirm-word-${slot}"]`);
    const labelText = (await label.textContent()) ?? "";
    const match = labelText.match(/Word\s+(\d+)/);
    if (!match) throw new Error(`Could not parse confirm label: "${labelText}"`);
    const expected = words[parseInt(match[1], 10) - 1];
    await page.getByTestId(`confirm-word-${slot}`).fill(expected);
  }
  await page.getByTestId("confirm-passphrase-btn").click();

  // Profile
  await page.getByTestId("display-name-input").fill(displayName);
  await page.getByTestId("finish-onboarding-btn").click();

  return { credentials, recoveryCode: words.join(" "), displayName };
}

/**
 * Helper for tests that want to sign back in. Walks the login form.
 */
export async function signIn(
  page: Page,
  credentials: AccountCredentials,
): Promise<void> {
  await page.goto("/auth/login");
  await page.getByTestId("login-email").fill(credentials.email);
  await page.getByTestId("login-password").fill(credentials.password);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("home-main").waitFor({ timeout: 20_000 });
}

/**
 * From a page that has a `qr-url-text` element (pairing initiator or contact
 * add), extract the URL displayed in the QR code text.
 */
export async function getPairingUrl(page: Page): Promise<string> {
  const url = await page.getByTestId("qr-url-text").textContent();
  if (!url) throw new Error("Could not read pairing URL");
  return url.trim();
}
