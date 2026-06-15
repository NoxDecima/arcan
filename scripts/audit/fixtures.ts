// scripts/audit/fixtures.ts

import type { Page, BrowserContext } from "@playwright/test";

/**
 * Deterministic credentials used across the audit. The api server's SQLite
 * at `api/auth.sqlite` accumulates across runs; the audit orchestrator wipes
 * it (and `.jazz-data/`) once before the first run, so these credentials
 * always start unregistered on the first call.
 *
 * On subsequent calls within the same orchestrator process the account
 * already exists — the seeder tries sign-in first and falls back to sign-up.
 */
const ALICE = {
  email: "alice@arcan-audit.local",
  password: "audit-alice-password-12345",
  displayName: "Alice Audit",
};

const BOB = {
  email: "bob@arcan-audit.local",
  password: "audit-bob-password-12345",
  displayName: "Bob Audit",
};

const CHARLIE = {
  email: "charlie@arcan-audit.local",
  password: "audit-charlie-password-12345",
  displayName: "Charlie Audit",
};

export interface Substitutions {
  meId?: string;
  bobId?: string;
  charlieId?: string;
  convId?: string;
  // Contact CoValue ID for /contacts/:contactID navigation.
  bobContactId?: string;
}

/**
 * Drive Playwright through the UI to reach the requested state. Returns
 * route-param substitutions for `:meId`, `:bobId`, `:convId`, etc.
 */
export async function seedState(
  context: BrowserContext,
  state: string,
): Promise<Substitutions> {
  switch (state) {
    case "anonymous":
      await context.clearCookies();
      return {};

    case "alice-empty":
      return await ensureSignedInAs(context, ALICE);

    case "alice-with-bob-1to1":
      return await aliceWithBob1to1(context);

    case "alice-with-group":
      return await aliceWithGroup(context);

    case "alice-with-live-invite":
      return await aliceWithLiveInvite(context);

    default:
      throw new Error(`unknown fixture state: ${state}`);
  }
}

// ─── Onboarding / sign-in primitives ─────────────────────────────────────

type Account = { email: string; password: string; displayName: string };

/**
 * Try sign-in; fall back to sign-up if the credentials don't exist.
 * Ends with a fresh page closed and returns the meId. The same email can
 * be requested repeatedly across the audit run; we always end up at "/"
 * with Alice (or whoever) signed in.
 */
async function ensureSignedInAs(
  context: BrowserContext,
  account: Account,
): Promise<Substitutions> {
  // Clear cookies so we don't accidentally pick up a stale Bob session.
  await context.clearCookies();
  const page = await context.newPage();
  try {
    const meId = await trySignIn(page, account);
    if (meId) return { meId };
    return { meId: await signUpAs(page, account) };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Attempt sign-in. Returns the meId on success, null on failure (treat as
 * "account doesn't exist yet, sign up instead"). Network or "Invalid
 * credentials" errors land in the null path.
 */
async function trySignIn(page: Page, account: Account): Promise<string | null> {
  await page.goto("/auth/login");
  // If we somehow landed on "/" already (already signed in), pick up meId.
  if (new URL(page.url()).pathname === "/") {
    return await readMeId(page);
  }
  await page.getByTestId("login-email").fill(account.email);
  await page.getByTestId("login-password").fill(account.password);
  await page.getByTestId("login-submit").click();
  try {
    await page.waitForURL((u) => u.pathname === "/", { timeout: 10_000 });
  } catch {
    // Either auth error or we never got redirected. Treat as needing sign-up.
    return null;
  }
  // sidebar-display-name is visible on both desktop AND mobile after sign-in.
  // (home-main is `hidden md:flex` so it never shows on the mobile viewport.)
  await page
    .getByTestId("sidebar-display-name")
    .waitFor({ timeout: 20_000 });
  return await readMeId(page);
}

/**
 * Full onboarding walk (welcome → credentials → backup-display → backup-confirm
 * → profile → home). Mirrors tests/e2e/helpers.ts createAccount but without
 * the random-id wrapper since the audit uses deterministic credentials.
 */
async function signUpAs(page: Page, account: Account): Promise<string> {
  await page.goto("/onboarding");
  await page.getByTestId("create-account-btn").click();

  await page.getByTestId("credentials-email").fill(account.email);
  await page.getByTestId("credentials-password").fill(account.password);
  await page.getByTestId("credentials-confirm").fill(account.password);
  await page.getByTestId("credentials-continue").click();

  // Read the 24-word recovery code from the backup-display step.
  const wordDivs = page.locator('[data-testid="passphrase-grid"] > div');
  const count = await wordDivs.count();
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    const span = wordDivs.nth(i).locator("span").nth(1);
    words.push((await span.textContent()) ?? "");
  }
  await page.getByTestId("passphrase-saved-checkbox").check();
  await page.getByTestId("passphrase-display-continue").click();

  // 3 confirm slots; read which word index each requests from the label.
  for (let slot = 0; slot < 3; slot++) {
    const label = page.locator(`label[for="confirm-word-${slot}"]`);
    const txt = (await label.textContent()) ?? "";
    const m = txt.match(/Word\s+(\d+)/);
    if (!m) throw new Error(`unparseable confirm label slot ${slot}: "${txt}"`);
    await page.getByTestId(`confirm-word-${slot}`).fill(words[parseInt(m[1], 10) - 1]);
  }
  await page.getByTestId("confirm-passphrase-btn").click();

  await page.getByTestId("display-name-input").fill(account.displayName);
  await page.getByTestId("finish-onboarding-btn").click();

  await page
    .getByTestId("sidebar-display-name")
    .waitFor({ timeout: 30_000 });
  return await readMeId(page);
}

async function signOut(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto("/settings");
    // sign-out button lives in AccountSection.
    const btn = page.getByTestId("sign-out-btn");
    if (await btn.count()) {
      await btn.click().catch(() => {});
    }
  } finally {
    await page.close().catch(() => {});
  }
  // Belt and suspenders: also clear cookies (the api session cookie).
  await context.clearCookies();
}

async function readMeId(page: Page): Promise<string> {
  // sidebar-header-profile exposes data-account-id (added for the audit).
  const el = page.locator('[data-testid="sidebar-header-profile"]');
  await el.first().waitFor({ state: "attached", timeout: 10_000 }).catch(() => {});
  const id = await el.first().getAttribute("data-account-id").catch(() => null);
  if (id) return id;
  // Fallback (should not normally hit).
  return "";
}

// ─── Multi-account fixtures ──────────────────────────────────────────────

/**
 * Bob first, generate an invite link; Alice signs in, accepts. End state:
 * signed in as Alice with Bob in contacts + a 1:1 conversation with 3
 * messages for richer visual coverage.
 *
 * Pattern mirrors tests/e2e/contact-invitation.spec.ts and messaging-1to1
 * but stays in a single browser context, signing out and back in between
 * the two roles. This is slow (~30-60s) but deterministic.
 */
async function aliceWithBob1to1(
  context: BrowserContext,
): Promise<Substitutions> {
  // 1. Bob signs up (or signs in if a prior fixture call already created him).
  await ensureSignedInAs(context, BOB);

  // 2. Bob generates an invite URL on /contacts/add.
  const bobPage = await context.newPage();
  await bobPage.goto("/contacts/add");
  await bobPage.getByTestId("qr-url-text").waitFor({ timeout: 15_000 });
  const inviteUrl = (
    await bobPage.getByTestId("qr-url-text").textContent()
  )?.trim();
  await bobPage.close();
  if (!inviteUrl) throw new Error("could not read Bob's invite URL");

  // 3. Sign out, sign in as Alice, accept the invite.
  await signOut(context);
  const aliceSubs = await ensureSignedInAs(context, ALICE);
  const meId = aliceSubs.meId ?? "";

  const alicePage = await context.newPage();
  try {
    await alicePage.goto(inviteUrl);
    await alicePage
      .getByTestId("invite-inviter-name")
      .waitFor({ timeout: 20_000 });
    await alicePage.getByTestId("invite-accept-btn").click();
    await alicePage
      .getByTestId("invite-accepted")
      .waitFor({ timeout: 20_000 });

    // 4. Open the contact and start a chat.
    await alicePage.goto("/contacts");
    await alicePage
      .getByTestId("contacts-page-row-0")
      .waitFor({ timeout: 15_000 });

    // Read the contact id from the row attribute before clicking — we use
    // it to substitute :bobContactId for the contact-detail surface.
    const bobContactId = await alicePage
      .getByTestId("contacts-page-row-0")
      .getAttribute("data-contact-id");
    const bobAccountId = await alicePage
      .getByTestId("contacts-page-row-0")
      .getAttribute("data-account-id");

    await alicePage.getByTestId("contacts-page-row-0").click();
    await alicePage.getByTestId("start-chat-btn").waitFor({ timeout: 10_000 });
    await alicePage.getByTestId("start-chat-btn").click();

    await alicePage
      .getByTestId("conversation-detail")
      .waitFor({ timeout: 15_000 });

    // Send 3 messages for richer visual coverage.
    for (const msg of [
      "Hi Bob!",
      "How's the new build coming?",
      "Let me know when you're free.",
    ]) {
      await alicePage.getByTestId("composer-input").fill(msg);
      await alicePage.getByTestId("composer-send-btn").click();
      await alicePage
        .getByTestId("message-timeline")
        .getByText(msg, { exact: true })
        .first()
        .waitFor({ timeout: 5_000 });
    }

    const url = alicePage.url();
    const convId =
      url.match(/\/conversations\/([A-Za-z0-9_-]+)/)?.[1] ?? "";

    return {
      meId,
      bobId: bobAccountId ?? "",
      convId,
      bobContactId: bobContactId ?? "",
    };
  } finally {
    await alicePage.close().catch(() => {});
  }
}

/**
 * Alice + Bob + Charlie, with a group "Audit Trip" containing all three.
 * Builds on aliceWithBob1to1 then pairs Charlie + creates a group.
 *
 * NOTE: this fixture is the slowest in the audit (creates 3 accounts +
 * pairs all of them + creates a group). Expect 60-90s on a cold sync.
 */
async function aliceWithGroup(
  context: BrowserContext,
): Promise<Substitutions> {
  // Reuse the 1:1 fixture to get Alice + Bob paired.
  const base = await aliceWithBob1to1(context);

  // Now also pair Alice with Charlie.
  await signOut(context);
  await ensureSignedInAs(context, CHARLIE);

  const charliePage = await context.newPage();
  await charliePage.goto("/contacts/add");
  await charliePage.getByTestId("qr-url-text").waitFor({ timeout: 15_000 });
  const charlieInvite = (
    await charliePage.getByTestId("qr-url-text").textContent()
  )?.trim();
  await charliePage.close();
  if (!charlieInvite)
    throw new Error("could not read Charlie's invite URL");

  await signOut(context);
  await ensureSignedInAs(context, ALICE);

  const aliceAccept = await context.newPage();
  try {
    await aliceAccept.goto(charlieInvite);
    await aliceAccept
      .getByTestId("invite-inviter-name")
      .waitFor({ timeout: 20_000 });
    await aliceAccept.getByTestId("invite-accept-btn").click();
    await aliceAccept
      .getByTestId("invite-accepted")
      .waitFor({ timeout: 20_000 });
  } finally {
    await aliceAccept.close().catch(() => {});
  }

  // Open the new-conversation route, multi-select Bob + Charlie, create
  // group "Audit Trip".
  const groupPage = await context.newPage();
  try {
    await groupPage.goto("/conversations/new");
    await groupPage.getByTestId("new-convo-back").waitFor({ timeout: 10_000 });

    // Two contacts (Bob + Charlie) should show. Use new-convo-contact-<id>.
    // We pick both via the visible rows.
    const contactRows = groupPage.locator('[data-testid^="new-convo-contact-"]');
    const rowCount = await contactRows.count();
    if (rowCount < 2)
      throw new Error(`expected ≥2 contacts in /conversations/new, got ${rowCount}`);
    await contactRows.nth(0).click();
    await contactRows.nth(1).click();

    await groupPage.getByTestId("new-convo-group-name").fill("Audit Trip");
    await groupPage.getByTestId("new-convo-submit").click();

    await groupPage
      .getByTestId("conversation-detail")
      .waitFor({ timeout: 20_000 });

    // Send a group message for visual coverage.
    await groupPage.getByTestId("composer-input").fill("Welcome to the trip group!");
    await groupPage.getByTestId("composer-send-btn").click();
    await groupPage
      .getByTestId("message-timeline")
      .getByText("Welcome to the trip group!")
      .first()
      .waitFor({ timeout: 5_000 });

    const url = groupPage.url();
    const convId =
      url.match(/\/conversations\/([A-Za-z0-9_-]+)/)?.[1] ?? "";

    return { ...base, convId };
  } finally {
    await groupPage.close().catch(() => {});
  }
}

/**
 * Alice with at least one active live invitation. Visiting /contacts/add
 * creates an Invitation as a side-effect and pushes it to
 * me.root.liveInvitations.
 */
async function aliceWithLiveInvite(
  context: BrowserContext,
): Promise<Substitutions> {
  const subs = await ensureSignedInAs(context, ALICE);
  const page = await context.newPage();
  try {
    await page.goto("/contacts/add");
    // Wait for the invitation to be generated (qr-url-text appears).
    await page.getByTestId("qr-url-text").waitFor({ timeout: 15_000 });
    // Give the live-invitations push a beat to settle.
    await page.waitForTimeout(500);
  } finally {
    await page.close().catch(() => {});
  }
  return subs;
}
