import { Page, expect } from "@playwright/test";

export type AccountCredentials = {
  email: string;
  password: string;
};

/**
 * Generate unique-per-test credentials so concurrent e2e specs don't collide
 * on email uniqueness in the auth-server DB.
 */
export function freshCredentials(prefix = "alice"): AccountCredentials {
  const id = Math.random().toString(36).slice(2, 10);
  return {
    email: `${prefix}-${id}@example.com`,
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
  await page.getByTestId("credentials-password").fill(credentials.password);
  await page.getByTestId("credentials-confirm").fill(credentials.password);
  await page.getByTestId("credentials-continue").click();

  // Backup display
  const words = await captureRecoveryCode(page);
  await page.getByTestId("passphrase-saved-checkbox").check();
  await page.getByTestId("passphrase-display-continue").click();

  // Backup confirm (3 challenge words). The confirm step renders no `for`
  // attribute on the <label>; the input carries data-testid=confirm-word-N and
  // its sibling <span> reads "word #NN" (zero-padded, 1-based). Read NN from
  // that span to pick the right word from the captured grid.
  for (let slot = 0; slot < 3; slot++) {
    const input = page.getByTestId(`confirm-word-${slot}`);
    await input.waitFor({ timeout: 20_000 });
    const labelText = (await input.locator("xpath=../span").first().textContent()) ?? "";
    const match = labelText.match(/#?\s*0*(\d+)/);
    if (!match) throw new Error(`Could not parse confirm label: "${labelText}"`);
    const expected = words[parseInt(match[1], 10) - 1];
    await input.fill(expected);
  }
  await page.getByTestId("confirm-passphrase-btn").click();

  // Profile
  await page.getByTestId("display-name-input").fill(displayName);
  await page.getByTestId("finish-onboarding-btn").click();

  // Wait for home. The bridge in src/jazz/createAccountFromSeed.ts awaits
  // waitForAllCoValuesSync before resolving so no extra settle is needed.
  await page.getByTestId("home-main").waitFor({ timeout: 20_000 });

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
  await page.getByTestId("credentials-password").fill(credentials.password);
  await page.getByTestId("credentials-confirm").fill(credentials.password);
  await page.getByTestId("credentials-continue").click();

  // Backup display
  const words = await captureRecoveryCode(page);
  await page.getByTestId("passphrase-saved-checkbox").check();
  await page.getByTestId("passphrase-display-continue").click();

  // Backup confirm (see createAccount above for the selector rationale).
  for (let slot = 0; slot < 3; slot++) {
    const input = page.getByTestId(`confirm-word-${slot}`);
    await input.waitFor({ timeout: 20_000 });
    const labelText = (await input.locator("xpath=../span").first().textContent()) ?? "";
    const match = labelText.match(/#?\s*0*(\d+)/);
    if (!match) throw new Error(`Could not parse confirm label: "${labelText}"`);
    const expected = words[parseInt(match[1], 10) - 1];
    await input.fill(expected);
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
 *
 * Note: on /contacts/add the qr-url-text / copy-url-text spans are `sr-only`
 * (visually hidden), so callers must wait on `attached`, not `visible`.
 */
export async function getPairingUrl(page: Page): Promise<string> {
  const el = page.getByTestId("qr-url-text");
  await el.waitFor({ state: "attached", timeout: 15_000 });
  const url = await el.textContent();
  if (!url) throw new Error("Could not read pairing URL");
  return url.trim();
}

/**
 * Establish a mutual contact between two already-onboarded accounts via the
 * real connection UI.
 *
 * Unit 9-7 replaced the old symmetric invite flow (one tap → both sides see
 * `invite-accepted` / `add-contact-accepted`) with an asymmetric
 * request/approve handshake. This helper drives the full happy path:
 *
 *   1. `inviterPage` opens /contacts/add and exposes a link-channel invite URL
 *      (the `copy-url-text` sr-only span — channel="link", silent on pending).
 *   2. `requesterPage` opens it, confirms the inviter, and clicks "connect" →
 *      mints a ConnectionRequest and lands on the "request sent" screen.
 *   3. `inviterPage` approves the request from /connections/pending.
 *   4. `requesterPage`'s poll detects approval and writes the contact, landing
 *      on the "contact added" (invite-approved) screen.
 *
 * After it resolves, both accounts have each other in their contactBook.
 *
 * The link channel + explicit /connections/pending approval is used (rather
 * than the QR live-prompt modal) because it is deterministic and independent
 * of which screen the inviter happens to be sitting on.
 */
export async function establishContact(
  inviterPage: Page,
  requesterPage: Page,
  inviterName: string,
): Promise<void> {
  await inviterPage.goto("/contacts/add");
  // copy-url-text is sr-only — wait for attachment, not visibility.
  const copyUrl = inviterPage.getByTestId("copy-url-text");
  await copyUrl.waitFor({ state: "attached", timeout: 15_000 });
  const inviteUrl = (await copyUrl.textContent())!.trim();

  await requesterPage.goto(inviteUrl);
  await expect(requesterPage.getByTestId("invite-inviter-name")).toContainText(
    inviterName,
    { timeout: 15_000 },
  );
  await requesterPage.getByTestId("invite-accept-btn").click();
  await expect(requesterPage.getByTestId("invite-sent")).toBeVisible({
    timeout: 30_000,
  });

  // Inviter approves from the pending surface. Retry the navigate+click to
  // absorb cross-context sync lag before the request lands in the durable
  // incomingRequests list that /connections/pending reads from.
  await expect(async () => {
    await inviterPage.goto("/connections/pending");
    await inviterPage
      .getByTestId("approve")
      .first()
      .click({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });

  // Requester's poll detects approvedAt, writes the inviter as a contact, and
  // advances to the "contact added" screen.
  await expect(requesterPage.getByTestId("invite-approved")).toBeVisible({
    timeout: 30_000,
  });
}

/**
 * From the home screen, open (creating if needed) the 1:1 conversation with a
 * contact, landing on the conversation detail.
 *
 * Unit 8d/9 replaced the standalone /contacts list + /contacts/:id detail
 * (`contacts-page-row-N` → `start-chat-btn`) with the sidebar contacts tab
 * (`sidebar-contact-row-N`) → polymorphic profile route (`profile-message`).
 */
export async function openDirectChat(
  page: Page,
  contactName: string,
): Promise<void> {
  // /contacts redirects to the sidebar contacts tab; go there directly.
  await page.goto("/?tab=contacts");
  const list = page.getByTestId("sidebar-contacts-list");
  await expect(list).toContainText(contactName, { timeout: 15_000 });
  // The contact row is a <Link> with the name in a <span>; clicking it opens
  // the polymorphic profile route.
  await list.getByText(contactName, { exact: false }).first().click();
  await expect(page.getByTestId("profile-message")).toBeVisible({
    timeout: 10_000,
  });
  await page.getByTestId("profile-message").click();
  await expect(page.getByTestId("conversation-detail")).toBeVisible({
    timeout: 15_000,
  });
}
