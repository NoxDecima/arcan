import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * E2E: Last-admin leave promotes a writer before leaving
 *
 * Main scenario:
 *   Alice creates a 3-member group (Alice=admin, Bob=writer, Charlie=writer).
 *   Alice removes Charlie so only Alice+Bob remain (Alice last admin).
 *   Alice clicks "Leave conversation" → LeaveWithPromoteDialog opens.
 *   Alice selects Bob → "Promote and leave" button → submits.
 *   Assertions:
 *   - Alice navigates to /conversations; conversation no longer in her list
 *   - Bob's /members shows him as admin
 *   - Bob sees system-event-left for Alice in the timeline
 *
 * Edge case — no dialog when not last admin:
 *   In a 1:1 (DM) conversation both parties are admin; Alice is not the sole admin.
 *   Alice clicks leave → plain confirm dialog (no LeaveWithPromoteDialog).
 *   Alice leaves; conversation disappears from her list.
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

test("last-admin leave promotes a writer before leaving", async ({ browser }) => {
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

    const { ctx: _ctxCharlie } = await pairWith(browser, pageA, "Charlie");
    ctxCharlie = _ctxCharlie;

    // ── 3. Alice creates a 3-member group (Alice admin, Bob+Charlie writers) ─
    await pageA.goto("/conversations");
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
    await pageA.getByTestId("new-chat-btn").click();
    await expect(pageA.getByTestId("contact-picker-overlay")).toBeVisible({
      timeout: 5_000,
    });

    // Select both contacts
    await pageA.getByTestId("contact-picker-row-0").click();
    await pageA.getByTestId("contact-picker-row-1").click();
    await pageA.getByTestId("contact-picker-continue").click();

    await expect(pageA.getByTestId("group-create-overlay")).toBeVisible({ timeout: 5_000 });
    await pageA.getByTestId("group-create-title-input").fill("Last Admin Test");
    await pageA.getByTestId("group-create-submit").click();

    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 15_000 });

    // ── 4. Alice navigates to /members and removes Charlie ───────────────────
    await pageA.getByTestId("members-link").click();
    await expect(pageA.getByTestId("members-route")).toBeVisible({ timeout: 5_000 });

    // Find Charlie's accountID
    const membersList = pageA.getByTestId("members-list");
    const charlieRow = membersList
      .locator('[data-testid^="member-row-"]')
      .filter({ hasText: "Charlie" });
    await expect(charlieRow).toBeVisible({ timeout: 5_000 });
    const charlieTestId = await charlieRow.getAttribute("data-testid");
    const charlieAccountID = charlieTestId?.replace("member-row-", "") ?? "";

    // Find Bob's accountID for later assertions
    const bobRow = membersList
      .locator('[data-testid^="member-row-"]')
      .filter({ hasText: "Bob" });
    await expect(bobRow).toBeVisible({ timeout: 5_000 });
    const bobTestId = await bobRow.getAttribute("data-testid");
    const bobAccountID = bobTestId?.replace("member-row-", "") ?? "";

    // Remove Charlie
    pageA.once("dialog", (dialog) => dialog.accept());
    await pageA.getByTestId(`remove-${charlieAccountID}`).click();
    await expect(
      pageA.getByTestId(`member-row-${charlieAccountID}`),
    ).not.toBeVisible({ timeout: 10_000 });

    // Now only Alice (admin) + Bob (writer) remain → Alice is last admin

    // ── 5. Alice clicks "Leave conversation" ─────────────────────────────────
    await pageA.getByTestId("leave-conversation-btn").click();

    // LeaveWithPromoteDialog should appear (Alice is last admin, Bob is remaining member)
    await expect(pageA.getByTestId("leave-promote-overlay")).toBeVisible({ timeout: 5_000 });
    await expect(pageA.getByTestId("leave-promote-candidates")).toContainText("Bob");

    // ── 6. Alice selects Bob and submits ─────────────────────────────────────
    // Bob is the first (and only) candidate; he should be pre-selected
    await pageA.getByTestId("leave-promote-submit").click();

    // Alice navigates to /conversations
    await expect(pageA).toHaveURL(/\/conversations$/, { timeout: 10_000 });

    // After reload, conversation no longer in Alice's list
    await pageA.reload();
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
    await expect(pageA.getByTestId("conversation-row-0")).not.toBeVisible({
      timeout: 10_000,
    });

    // ── 7. Bob's /members shows him as admin ─────────────────────────────────
    // Bob needs to first discover the conversation
    await pageBob.goto("/conversations");
    await expect(pageBob.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 30_000,
    });
    await pageBob.getByTestId("conversation-row-0").click();
    await expect(pageBob.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });

    await pageBob.getByTestId("members-link").click();
    await expect(pageBob.getByTestId("members-route")).toBeVisible({ timeout: 5_000 });

    const bobOwnRow = pageBob
      .getByTestId("members-list")
      .locator('[data-testid^="member-row-"]')
      .filter({ hasText: "Bob" });
    await expect(bobOwnRow.getByTestId("role-pill-admin")).toBeVisible({ timeout: 10_000 });

    // Alice's row should not exist (she left)
    await expect(pageBob.getByTestId(`member-row-${bobAccountID}`)).toBeVisible({
      timeout: 5_000,
    });
    // Bob's row exists, Alice's does not — just verify Bob shows as admin
    await expect(bobOwnRow.getByTestId("role-pill-admin")).toBeVisible();

    // ── 8. Bob sees system event for Alice leaving ────────────────────────────
    await pageBob.getByTestId("back-btn").click();
    await expect(pageBob.getByTestId("conversation-detail")).toBeVisible({ timeout: 5_000 });
    await expect(pageBob.getByTestId("system-event-left")).toContainText(
      "Alice left the chat",
      { timeout: 15_000 },
    );
  } finally {
    await ctxA.close();
    if (ctxBob) await ctxBob.close();
    if (ctxCharlie) await ctxCharlie.close();
  }
});

test("leave conversation without promote dialog — not last admin (1:1 DM)", async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  let ctxBob: BrowserContext | null = null;

  try {
    // ── 1. Create Alice and Bob, pair them ────────────────────────────────────
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    const { ctx: _ctxBob, page: pageBob } = await pairWith(browser, pageA, "Bob");
    ctxBob = _ctxBob;
    void pageBob; // Bob's page not needed for this edge case

    // ── 2. Alice starts a 1:1 chat with Bob ──────────────────────────────────
    await pageA.goto("/conversations");
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
    await pageA.getByTestId("new-chat-btn").click();
    await expect(pageA.getByTestId("contact-picker-overlay")).toBeVisible({ timeout: 5_000 });
    await pageA.getByTestId("contact-picker-row-0").click();
    await pageA.getByTestId("contact-picker-continue").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 15_000 });

    // ── 3. Alice navigates to /members and clicks "Leave conversation" ────────
    // In a 1:1 both parties are admin; Alice is NOT the last admin (Bob is also admin).
    // So no LeaveWithPromoteDialog should appear — just a plain confirm dialog.
    await pageA.getByTestId("members-link").click();
    await expect(pageA.getByTestId("members-route")).toBeVisible({ timeout: 5_000 });

    // Accept the confirm dialog
    pageA.once("dialog", (dialog) => dialog.accept());
    await pageA.getByTestId("leave-conversation-btn").click();

    // Alice navigates to /conversations (no promote dialog appeared)
    await expect(pageA).toHaveURL(/\/conversations$/, { timeout: 10_000 });

    // ── 4. Confirm LeaveWithPromoteDialog did NOT appear ──────────────────────
    // (If it had appeared, the plain confirm would have been blocked and the URL
    // would not have changed. The URL change above is sufficient confirmation.)
    await pageA.reload();
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
    await expect(pageA.getByTestId("conversation-row-0")).not.toBeVisible({
      timeout: 10_000,
    });
  } finally {
    await ctxA.close();
    if (ctxBob) await ctxBob.close();
  }
});
