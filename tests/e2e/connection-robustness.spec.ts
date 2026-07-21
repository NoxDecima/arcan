import { test, expect, type Page } from "@playwright/test";
import {
  createAccount,
  establishContact,
  createConversation,
  openMembers,
  memberAccountID,
  memberAction,
  openMemberMenu,
} from "./helpers";

/**
 * Contact-robustness slice e2e (spec §7).
 *
 * Covers: double-tap Connect mints exactly one request (FM1); the requester
 * gets the contact even after closing the tab before approval (FM3 — the
 * app-level watcher, not the old tab-lifetime poll); the group channel
 * produces contacts on BOTH sides (FM4); a revoked invite is blocked at
 * Connect time, not just at mount (inventory §5).
 *
 * Deviations from the plan's spec code (verified against current source):
 * - `test.setTimeout(...)` added per repo convention (group-create.spec.ts):
 *   these multi-context flows exceed Playwright's 30 s default test timeout.
 * - Safety-number cross-check ADDED to the FM4 test: each side's pinned code
 *   for the peer must equal the peer's OWN code. This pins the C1 fix —
 *   group-channel fingerprint snapshots must be target-derived
 *   (getForeignAccountPubkeyHex); a node-derived snapshot would pin the
 *   requester's own key and the two safety screens would disagree.
 */

async function revealInviteUrl(page: Page): Promise<string> {
  await page.goto("/contacts/add");
  // Invitations mint lazily (FM10) — reveal first.
  await page.getByTestId("add-contact-reveal-btn").click();
  const copyUrl = page.getByTestId("copy-url-text");
  await copyUrl.waitFor({ state: "attached", timeout: 15_000 });
  return (await copyUrl.textContent())!.trim();
}

/**
 * Read the safety code a user sees on their OWN profile — derived from the
 * live signing key, i.e. this account's real identity.
 */
async function ownSafetyCode(page: Page, accountID: string): Promise<string> {
  await page.goto(`/profile/${accountID}`);
  await page.getByTestId("profile-safety-toggle").click();
  const code = page.getByTestId("safety-number");
  await expect(code).toBeVisible({ timeout: 15_000 });
  return (await code.textContent())!.trim();
}

/**
 * Read the safety code a user sees on a CONTACT's profile — the TOFU pin.
 * Waits for contact-remove-btn (renders iff the contacts-record entry
 * exists) so the code read is the pinned fingerprint, not the live-account
 * fallback the profile shows for non-contacts.
 */
async function pinnedSafetyCode(
  page: Page,
  accountID: string,
): Promise<string> {
  await page.goto(`/profile/${accountID}`);
  await expect(page.getByTestId("contact-remove-btn")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId("profile-safety-toggle").click();
  const code = page.getByTestId("safety-number");
  await expect(code).toBeVisible({ timeout: 15_000 });
  return (await code.textContent())!.trim();
}

test("double-tap Connect mints exactly one request", async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const alice = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const bob = await ctxB.newPage();
  try {
    await bob.goto("/");
    await createAccount(bob, "Bob");
    await alice.goto("/");
    await createAccount(alice, "Alice");

    const inviteUrl = await revealInviteUrl(bob);

    await alice.goto("/");
    await alice.goto(inviteUrl);
    await expect(alice.getByTestId("invite-inviter-name")).toContainText(
      "Bob",
      { timeout: 15_000 },
    );
    // Two rapid activations — the in-flight guard + durable outgoing entry
    // must collapse them into ONE ConnectionRequest.
    await alice.getByTestId("invite-accept-btn").dblclick();
    await expect(alice.getByTestId("invite-sent")).toBeVisible({
      timeout: 30_000,
    });

    await expect(async () => {
      await bob.goto("/connections/pending");
      await expect(bob.getByTestId("approve").first()).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 30_000 });
    await expect(bob.getByTestId("approve")).toHaveCount(1);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test("requester who closed the tab gets the contact on next launch (FM3)", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const alice = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const bob = await ctxB.newPage();
  try {
    await bob.goto("/");
    await createAccount(bob, "Bob");
    await alice.goto("/");
    await createAccount(alice, "Alice");

    const inviteUrl = await revealInviteUrl(bob);

    await alice.goto("/");
    await alice.goto(inviteUrl);
    await expect(alice.getByTestId("invite-inviter-name")).toContainText(
      "Bob",
      { timeout: 15_000 },
    );
    await alice.getByTestId("invite-accept-btn").click();
    await expect(alice.getByTestId("invite-sent")).toBeVisible({
      timeout: 30_000,
    });
    // The old poll died with the tab. The durable outgoingRequests entry
    // must not.
    await alice.close();

    await expect(async () => {
      await bob.goto("/connections/pending");
      await bob.getByTestId("approve").first().click({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    // Fresh page, same storage — the launch watcher sees approvedAt and
    // writes the contact.
    const alice2 = await ctxA.newPage();
    await alice2.goto("/?tab=contacts");
    await expect(alice2.getByTestId("sidebar-contacts-list")).toContainText(
      "Bob",
      { timeout: 30_000 },
    );
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test("group-channel connect produces contacts on BOTH sides (FM4)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const ctxRoot = await browser.newContext();
  const root = await ctxRoot.newPage();
  const ctxBran = await browser.newContext();
  const bran = await ctxBran.newPage();
  const ctxCass = await browser.newContext();
  const cass = await ctxCass.newPage();
  try {
    await root.goto("/");
    await createAccount(root, "Root");
    await bran.goto("/");
    await createAccount(bran, "Bran");
    await cass.goto("/");
    await createAccount(cass, "Cass");

    // Root is mutual contacts with both; Bran and Cass are strangers.
    await establishContact(bran, root, "Bran");
    await establishContact(cass, root, "Cass");

    await createConversation(root, ["Bran", "Cass"], "trio");

    // Bran auto-discovers the group and requests a connection to Cass.
    await expect(async () => {
      await bran.goto("/");
      await bran.getByText("trio", { exact: false }).first().click();
      await expect(bran.getByTestId("conversation-detail")).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 30_000 });
    await openMembers(bran);
    const cassID = await memberAccountID(bran, "Cass");
    const branID = await memberAccountID(bran, "Bran");
    await memberAction(bran, cassID, "request-connection");

    // The kebab item now reflects the durable pending state.
    await openMemberMenu(bran, cassID);
    await expect(
      bran.getByTestId(`request-connection-${cassID}`),
    ).toContainText("request pending", { timeout: 10_000 });
    await expect(
      bran.getByTestId(`request-connection-${cassID}`),
    ).toBeDisabled();

    // Cass approves from the pending surface.
    await expect(async () => {
      await cass.goto("/connections/pending");
      await cass.getByTestId("approve").first().click({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    // BOTH sides converge on mutual contacts (previously only the approver).
    await cass.goto("/?tab=contacts");
    await expect(cass.getByTestId("sidebar-contacts-list")).toContainText(
      "Bran",
      { timeout: 15_000 },
    );
    await bran.goto("/?tab=contacts");
    await expect(bran.getByTestId("sidebar-contacts-list")).toContainText(
      "Cass",
      { timeout: 30_000 },
    );

    // ── Safety-number cross-check (ADDED; proves the C1 fingerprint fix) ──
    // Each side's TOFU pin of the peer must equal the peer's real identity
    // as shown on the peer's own profile. Pre-C1, the group-channel snapshot
    // was node-derived: Bran's pin of Cass would have carried Bran's OWN
    // key, and the two safety screens would disagree.
    const branSeesCass = await pinnedSafetyCode(bran, cassID);
    const cassOwnCode = await ownSafetyCode(cass, cassID);
    expect(branSeesCass).toBe(cassOwnCode);

    const cassSeesBran = await pinnedSafetyCode(cass, branID);
    const branOwnCode = await ownSafetyCode(bran, branID);
    expect(cassSeesBran).toBe(branOwnCode);
  } finally {
    await ctxRoot.close();
    await ctxBran.close();
    await ctxCass.close();
  }
});

test("revoked invite is blocked at Connect time (parked confirm screen)", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  const alice = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const bob = await ctxB.newPage();
  try {
    await bob.goto("/");
    await createAccount(bob, "Bob");
    await alice.goto("/");
    await createAccount(alice, "Alice");

    const inviteUrl = await revealInviteUrl(bob);

    // Alice parks on the confirm screen…
    await alice.goto("/");
    await alice.goto(inviteUrl);
    await expect(alice.getByTestId("invite-inviter-name")).toContainText(
      "Bob",
      { timeout: 15_000 },
    );

    // …while Bob revokes the invitation.
    await bob.goto("/connections/live-invites");
    await bob.getByTestId("revoke").first().click();

    // Connect must re-validate and refuse — no request is sent.
    await alice.getByTestId("invite-accept-btn").click();
    await expect(alice.getByTestId("invite-expired")).toBeVisible({
      timeout: 15_000,
    });
    await bob.goto("/connections/pending");
    await expect(bob.getByTestId("approve")).toHaveCount(0);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
