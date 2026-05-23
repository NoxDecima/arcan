import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * E2E: Admin promotion and demotion in group conversation
 *
 * Alice creates a 3-member group (Alice admin, Bob writer, Charlie writer).
 * Alice promotes Bob to admin. Bob's /members view then shows the admin role
 * badge and admin action buttons (add-member, promote/demote/remove for others).
 *
 * Note on demote: cojson 0.20.18 prevents an admin from downgrading another
 * admin's role ("Failed to set role writer to <id> (role of current account is
 * admin)"). Only the target admin can relinquish their own role. The MembersRoute
 * exposes the Demote button for admin rows (as a UI affordance) but the protocol
 * call will throw at runtime. This test therefore does NOT assert a successful
 * Alice-demotes-Bob flow — that constraint is documented in
 * src/jazz/conversation.ts:demoteToWriter.
 */

async function pairWith(
  browser: import("@playwright/test").Browser,
  pageA: Page,
  name: string,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  await createAccount(page, name);

  await page.goto("/contacts/add");
  await expect(page.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
  const inviteUrl = (await page.getByTestId("qr-url-text").textContent())!.trim();

  // Navigate Alice to neutral page to avoid InviteRoute phase collision
  await pageA.goto("/conversations");
  await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
  await pageA.goto(inviteUrl);
  await expect(pageA.getByTestId("invite-inviter-name")).toContainText(name, {
    timeout: 15_000,
  });
  await pageA.getByTestId("invite-accept-btn").click();
  await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });

  return { ctx, page };
}

test("admin promotion and demotion in group conversation", async ({ browser }) => {
  test.setTimeout(300_000);

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  let ctxBob: BrowserContext | null = null;
  let ctxCharlie: BrowserContext | null = null;

  try {
    // ── 1. Create Alice ─────────────────────────────────────────────────────
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    // ── 2. Pair Alice with Bob and Charlie ───────────────────────────────────
    const { ctx: _ctxBob, page: pageBob } = await pairWith(browser, pageA, "Bob");
    ctxBob = _ctxBob;

    const { ctx: _ctxCharlie, page: pageCharlie } = await pairWith(
      browser,
      pageA,
      "Charlie",
    );
    ctxCharlie = _ctxCharlie;

    // ── 3. Alice creates a group with Bob and Charlie ────────────────────────
    await pageA.goto("/conversations");
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
    await pageA.getByTestId("new-chat-btn").click();
    await expect(pageA.getByTestId("contact-picker-overlay")).toBeVisible({
      timeout: 5_000,
    });

    // Select both contacts (Bob and Charlie)
    await pageA.getByTestId("contact-picker-row-0").click();
    await pageA.getByTestId("contact-picker-row-1").click();
    await pageA.getByTestId("contact-picker-continue").click();

    // GroupCreateDialog appears — name the group
    await expect(pageA.getByTestId("group-create-overlay")).toBeVisible({
      timeout: 5_000,
    });
    await pageA.getByTestId("group-create-title-input").fill("Role Test Group");
    await pageA.getByTestId("group-create-submit").click();

    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 15_000 });

    // ── 4. Alice opens /members — verifies Bob has writer role ───────────────
    await pageA.getByTestId("members-link").click();
    await expect(pageA.getByTestId("members-route")).toBeVisible({ timeout: 5_000 });

    const membersList = pageA.getByTestId("members-list");

    // Find Bob's member row
    const bobRow = membersList.locator('[data-testid^="member-row-"]').filter({
      hasText: "Bob",
    });
    await expect(bobRow).toBeVisible({ timeout: 5_000 });
    const bobTestId = await bobRow.getAttribute("data-testid");
    const bobAccountID = bobTestId?.replace("member-row-", "") ?? "";
    expect(bobAccountID).not.toBe("");

    // Bob should start as writer
    await expect(bobRow.getByTestId("role-pill-writer")).toBeVisible({ timeout: 5_000 });

    // Alice sees the promote button for Bob (writer → admin)
    await expect(pageA.getByTestId(`promote-${bobAccountID}`)).toBeVisible({
      timeout: 5_000,
    });

    // ── 5. Alice promotes Bob to admin ───────────────────────────────────────
    await pageA.getByTestId(`promote-${bobAccountID}`).click();

    // Bob's role pill updates to admin
    await expect(bobRow.getByTestId("role-pill-admin")).toBeVisible({ timeout: 10_000 });

    // The promote button is gone; the demote button appears
    await expect(pageA.getByTestId(`promote-${bobAccountID}`)).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(pageA.getByTestId(`demote-${bobAccountID}`)).toBeVisible({
      timeout: 5_000,
    });

    // ── 6. Bob's /members shows him as admin with admin actions ──────────────
    // Bob needs to discover the conversation first
    await pageBob.goto("/conversations");
    await expect(pageBob.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 30_000,
    });

    // Navigate Bob to the members route
    const membersUrl = pageA.url();
    await pageBob.goto(membersUrl);
    await expect(pageBob.getByTestId("members-route")).toBeVisible({ timeout: 10_000 });

    // Bob's own row shows admin role
    const bobOwnRow = pageBob.getByTestId("members-list").locator('[data-testid^="member-row-"]').filter({
      hasText: "Bob",
    });
    await expect(bobOwnRow.getByTestId("role-pill-admin")).toBeVisible({ timeout: 10_000 });

    // Bob (now admin) sees the "Add member" button
    await expect(pageBob.getByTestId("add-member-btn")).toBeVisible({ timeout: 5_000 });

    // Find Charlie's row on Bob's page — Bob should see promote/remove for Charlie (writer)
    const charlieRowOnBob = pageBob.getByTestId("members-list").locator('[data-testid^="member-row-"]').filter({
      hasText: "Charlie",
    });
    await expect(charlieRowOnBob).toBeVisible({ timeout: 5_000 });
    const charlieTestId = await charlieRowOnBob.getAttribute("data-testid");
    const charlieAccountID = charlieTestId?.replace("member-row-", "") ?? "";

    // Bob sees the promote button for Charlie (writer → admin)
    await expect(pageBob.getByTestId(`promote-${charlieAccountID}`)).toBeVisible({
      timeout: 5_000,
    });
    // Bob sees the remove button for Charlie
    await expect(pageBob.getByTestId(`remove-${charlieAccountID}`)).toBeVisible({
      timeout: 5_000,
    });

    // ── 7. Verify demote button exists for admins (cojson constraint note) ───
    // The demote button appears in the UI for admin members (as designed).
    // However, clicking it will throw at the protocol level because cojson prevents
    // an admin from downgrading another admin's role (only self-demotion is allowed,
    // which the current UI doesn't expose). This is a known cojson 0.20.18 constraint.
    // We verify the button is present but do not assert a successful demotion flow.
    const aliceRowOnBob = pageBob.getByTestId("members-list").locator('[data-testid^="member-row-"]').filter({
      hasText: "Alice",
    });
    await expect(aliceRowOnBob).toBeVisible({ timeout: 5_000 });
    const aliceTestId = await aliceRowOnBob.getAttribute("data-testid");
    const aliceAccountID = aliceTestId?.replace("member-row-", "") ?? "";
    // Bob (admin) sees the demote button for Alice (admin, not Bob himself)
    await expect(pageBob.getByTestId(`demote-${aliceAccountID}`)).toBeVisible({
      timeout: 5_000,
    });

    // Charlie (still writer) navigates to the conversation — should NOT see admin actions
    await pageCharlie.goto("/conversations");
    await expect(pageCharlie.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 30_000,
    });
    await pageCharlie.goto(membersUrl);
    await expect(pageCharlie.getByTestId("members-route")).toBeVisible({ timeout: 10_000 });
    // Charlie does not see the "Add member" button (writer-only view)
    await expect(pageCharlie.getByTestId("add-member-btn")).not.toBeVisible({
      timeout: 5_000,
    });
    // Charlie does not see promote/remove buttons for other members
    await expect(pageCharlie.getByTestId(`promote-${aliceAccountID}`)).not.toBeVisible({
      timeout: 5_000,
    });
  } finally {
    await ctxA.close();
    if (ctxBob) await ctxBob.close();
    if (ctxCharlie) await ctxCharlie.close();
  }
});
