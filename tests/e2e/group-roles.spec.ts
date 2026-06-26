import { test, expect } from "@playwright/test";
import {
  createAccount,
  establishContact,
  createConversation,
  openMembers,
  openMemberMenu,
} from "./helpers";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * E2E: Admin promotion in group conversation
 *
 * Alice creates a 3-member group (Alice admin, Bob writer, Charlie writer).
 * Alice promotes Bob to admin. Bob's /members view then shows the admin role
 * badge and admin action buttons (add-member, promote/remove for writers).
 *
 * Note: Slice 3c removed the Demote button from admin rows — cojson 0.20.18
 * forbids one admin from demoting another (confirmed via Phase A recon test).
 * The remove button is also hidden on admin rows for the same reason.
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

  await establishContact(page, pageA, name);

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
    await createConversation(pageA, ["Bob", "Charlie"], "Role Test Group");

    // ── 4. Alice opens /members — verifies Bob has writer role ───────────────
    await openMembers(pageA);

    const membersList = pageA.getByTestId("members-route");

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

    // Alice opens Bob's kebab and sees the promote action (writer → admin)
    await openMemberMenu(pageA, bobAccountID);
    await expect(pageA.getByTestId(`promote-${bobAccountID}`)).toBeVisible({
      timeout: 5_000,
    });

    // ── 5. Alice promotes Bob to admin ───────────────────────────────────────
    await pageA.getByTestId(`promote-${bobAccountID}`).click();

    // Bob's role pill updates to admin
    await expect(bobRow.getByTestId("role-pill-admin")).toBeVisible({ timeout: 10_000 });

    // The promote button is gone (Bob is now admin; no demote button on admin rows per Slice 3c)
    await expect(pageA.getByTestId(`promote-${bobAccountID}`)).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(pageA.getByTestId(`demote-${bobAccountID}`)).not.toBeVisible({
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
    const bobOwnRow = pageBob.getByTestId("members-route").locator('[data-testid^="member-row-"]').filter({
      hasText: "Bob",
    });
    await expect(bobOwnRow.getByTestId("role-pill-admin")).toBeVisible({ timeout: 10_000 });

    // Bob (now admin) sees the "Add member" button
    await expect(pageBob.getByTestId("add-member-btn")).toBeVisible({ timeout: 5_000 });

    // Find Charlie's row on Bob's page — Bob should see promote/remove for Charlie (writer)
    const charlieRowOnBob = pageBob.getByTestId("members-route").locator('[data-testid^="member-row-"]').filter({
      hasText: "Charlie",
    });
    await expect(charlieRowOnBob).toBeVisible({ timeout: 5_000 });
    const charlieTestId = await charlieRowOnBob.getAttribute("data-testid");
    const charlieAccountID = charlieTestId?.replace("member-row-", "") ?? "";

    // Open Charlie's kebab on Bob's view — Bob (admin) sees promote + remove.
    await openMemberMenu(pageBob, charlieAccountID);
    await expect(pageBob.getByTestId(`promote-${charlieAccountID}`)).toBeVisible({
      timeout: 5_000,
    });
    await expect(pageBob.getByTestId(`remove-${charlieAccountID}`)).toBeVisible({
      timeout: 5_000,
    });

    // ── 7. Verify admin rows have no demote/remove buttons (Slice 3c) ────────
    // Slice 3c removed the Demote button and hides Remove on admin rows.
    // Bob (admin) should NOT see demote or remove for Alice (also admin).
    const aliceRowOnBob = pageBob.getByTestId("members-route").locator('[data-testid^="member-row-"]').filter({
      hasText: "Alice",
    });
    await expect(aliceRowOnBob).toBeVisible({ timeout: 5_000 });
    const aliceTestId = await aliceRowOnBob.getAttribute("data-testid");
    const aliceAccountID = aliceTestId?.replace("member-row-", "") ?? "";
    // No demote button on admin rows
    await expect(pageBob.getByTestId(`demote-${aliceAccountID}`)).not.toBeVisible({
      timeout: 5_000,
    });
    // No remove button on admin rows (cojson admin-remove-admin forbidden per Phase A recon)
    await expect(pageBob.getByTestId(`remove-${aliceAccountID}`)).not.toBeVisible({
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
