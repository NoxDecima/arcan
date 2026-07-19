import { test, expect } from "@playwright/test";
import {
  createAccount,
  establishContact,
  createConversation,
  openMembers,
  memberAccountID,
  memberAction,
} from "./helpers";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * E2E: Last-admin leave promotes a writer before leaving
 *
 * Unit 9-6 removed the standalone 1:1 settings screen (a 1:1 redirects to the
 * other user's profile), so leave/promote is only reachable on a group's
 * members route, which itself only renders for groups of 3+ members.
 *
 * Main scenario (4 members so 3 remain — keeping a live members route — after
 * Alice leaves):
 *   Alice creates a group (Alice=admin, Bob/Charlie/Dave=writers). Alice is the
 *   sole admin, so leaving triggers the LeaveWithPromoteDialog. Alice promotes
 *   Bob and leaves.
 *   Assertions:
 *   - Alice navigates to /conversations; conversation no longer in her list
 *   - Bob's members route shows him as admin
 *   - Bob sees system-event-left for Alice in the timeline
 *
 * Edge case — no dialog when not last admin:
 *   In a group with two admins (Alice promotes Bob first), Alice is not the
 *   sole admin. Alice clicks leave → plain confirm dialog (no promote dialog).
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

test("last-admin leave promotes a writer before leaving", async ({ browser }) => {
  test.setTimeout(300_000);

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  let ctxBob: BrowserContext | null = null;
  let ctxCharlie: BrowserContext | null = null;
  let ctxDave: BrowserContext | null = null;

  try {
    // ── 1. Create Alice; pair with Bob, Charlie, Dave ────────────────────────
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    const { ctx: _ctxBob, page: pageBob } = await pairWith(browser, pageA, "Bob");
    ctxBob = _ctxBob;
    const { ctx: _ctxCharlie } = await pairWith(browser, pageA, "Charlie");
    ctxCharlie = _ctxCharlie;
    const { ctx: _ctxDave } = await pairWith(browser, pageA, "Dave");
    ctxDave = _ctxDave;

    // ── 2. Alice creates a 4-member group (Alice admin; others writers) ──────
    await createConversation(pageA, ["Bob", "Charlie", "Dave"], "Last Admin Test");
    const convUrl = pageA.url();

    // ── 3. Alice opens the members route and clicks "Leave conversation" ─────
    await openMembers(pageA);
    await pageA.getByTestId("leave-conversation-btn").click();

    // LeaveWithPromoteDialog appears (Alice is the sole admin, others remain)
    await expect(pageA.getByTestId("leave-promote-overlay")).toBeVisible({ timeout: 5_000 });
    await expect(pageA.getByTestId("leave-promote-candidates")).toContainText("Bob");

    // ── 4. Alice promotes Bob and submits ────────────────────────────────────
    await pageA
      .getByTestId("leave-promote-candidates")
      .locator("label")
      .filter({ hasText: "Bob" })
      .first()
      .click();
    await pageA.getByTestId("leave-promote-submit").click();

    // Alice navigates to /conversations
    await expect(pageA).toHaveURL(/\/conversations$/, { timeout: 10_000 });

    // After reload, conversation no longer in Alice's list
    await pageA.reload();
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
    await expect(pageA.getByTestId("conversation-row-0")).not.toBeVisible({
      timeout: 10_000,
    });

    // ── 5. Bob's members route shows him as admin ────────────────────────────
    // Bob discovers the conversation first; 3 members remain so the members
    // route still renders (no 1:1 redirect).
    await pageBob.goto("/conversations");
    await expect(pageBob.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 30_000,
    });
    await pageBob.goto(convUrl);
    await expect(pageBob.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });

    await openMembers(pageBob);
    const bobOwnRow = pageBob
      .getByTestId("members-route")
      .locator('[data-testid^="member-row-"]')
      .filter({ hasText: "Bob" });
    await expect(bobOwnRow.getByTestId("role-pill-admin")).toBeVisible({ timeout: 10_000 });

    // ── 6. Bob sees system event for Alice leaving ───────────────────────────
    await pageBob.goto(convUrl);
    await expect(pageBob.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });
    await expect(pageBob.getByTestId("system-event-left")).toContainText(
      "Alice left the chat",
      { timeout: 20_000 },
    );
  } finally {
    await ctxA.close();
    if (ctxBob) await ctxBob.close();
    if (ctxCharlie) await ctxCharlie.close();
    if (ctxDave) await ctxDave.close();
  }
});

test("leave conversation without promote dialog — not last admin", async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  let ctxBob: BrowserContext | null = null;
  let ctxCharlie: BrowserContext | null = null;

  try {
    // ── 1. Create Alice; pair with Bob and Charlie ───────────────────────────
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    const { ctx: _ctxBob } = await pairWith(browser, pageA, "Bob");
    ctxBob = _ctxBob;
    const { ctx: _ctxCharlie } = await pairWith(browser, pageA, "Charlie");
    ctxCharlie = _ctxCharlie;

    // ── 2. Alice creates a 3-person group ────────────────────────────────────
    await createConversation(pageA, ["Bob", "Charlie"], "No Promote Test");

    // ── 3. Alice promotes Bob → there are now two admins ─────────────────────
    await openMembers(pageA);
    const bobAccountID = await memberAccountID(pageA, "Bob");
    await memberAction(pageA, bobAccountID, "promote");
    await expect(
      pageA
        .getByTestId("members-route")
        .locator('[data-testid^="member-row-"]')
        .filter({ hasText: "Bob" })
        .getByTestId("role-pill-admin"),
    ).toBeVisible({ timeout: 10_000 });

    // ── 4. Alice clicks "Leave conversation" ─────────────────────────────────
    // Alice is NOT the sole admin (Bob is also admin) → plain confirm dialog,
    // NOT the LeaveWithPromoteDialog.
    // Custom in-DOM modal since 36df664; click the confirm button after triggering.
    await pageA.getByTestId("leave-conversation-btn").click();
    await pageA.getByTestId("confirm-dialog-confirm").click();

    // Alice navigates to /conversations (the plain confirm fired, so no promote
    // dialog appeared — if it had, the confirm would have been blocked).
    await expect(pageA).toHaveURL(/\/conversations$/, { timeout: 10_000 });

    // ── 5. Conversation disappears from Alice's list ─────────────────────────
    await pageA.reload();
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
    await expect(pageA.getByTestId("conversation-row-0")).not.toBeVisible({
      timeout: 10_000,
    });
  } finally {
    await ctxA.close();
    if (ctxBob) await ctxBob.close();
    if (ctxCharlie) await ctxCharlie.close();
  }
});
