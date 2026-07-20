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
 * E2E: Leave conversation
 *
 * Unit 9-6 removed the standalone 1:1 settings screen (a 1:1 redirects to the
 * other user's profile), so the leave action is only reachable on a group's
 * members route. This test therefore uses a 3-person group (Alice + Bob +
 * Charlie). Alice promotes Bob to admin so she is no longer the last admin,
 * then performs a plain self-leave.
 *
 * Behavior: after leaving, the conversation is removed from Alice's
 * knownConversations entirely (Jazz revokes her read access on self-leave),
 * and the remaining members see the "Alice left the chat" system event.
 *
 * Asserts:
 *   - Alice is navigated back to /conversations
 *   - The conversation disappears from Alice's sidebar
 *   - Bob sees the "Alice left the chat" system-event pill in the timeline
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

test("leave conversation — Alice revokes self, list updates", async ({ browser }) => {
  test.setTimeout(180_000); // generous timeout for cross-context Jazz sync

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  let ctxBob: BrowserContext | null = null;
  let ctxCharlie: BrowserContext | null = null;

  try {
    // ── 1. Create Alice; pair her with Bob and Charlie ───────────────────────
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    const { ctx: _ctxBob, page: pageBob } = await pairWith(browser, pageA, "Bob");
    ctxBob = _ctxBob;
    const { ctx: _ctxCharlie } = await pairWith(browser, pageA, "Charlie");
    ctxCharlie = _ctxCharlie;

    // ── 2. Alice creates a 3-person group and sends a message ────────────────
    await createConversation(pageA, ["Bob", "Charlie"], "Leave Test");
    const convUrl = pageA.url();

    await pageA.getByTestId("composer-input").fill("Hello before leaving");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText("Hello before leaving", {
      timeout: 5_000,
    });

    // ── 3. Bob opens the conversation (so he can observe the leave event) ─────
    await pageBob.goto(convUrl);
    await expect(pageBob.getByTestId("conversation-detail")).toBeVisible({ timeout: 15_000 });
    await expect(pageBob.getByTestId("message-timeline")).toContainText("Hello before leaving", {
      timeout: 15_000,
    });

    // ── 4. Alice promotes Bob to admin so she is not the last admin ──────────
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

    // ── 5. Alice leaves (plain confirm — she is no longer the last admin) ─────
    // Custom in-DOM modal since 36df664; click the confirm button after triggering.
    await pageA.getByTestId("leave-conversation-btn").click();
    await pageA.getByTestId("confirm-dialog-confirm").click();

    // Alice is navigated to /conversations
    await expect(pageA).toHaveURL(/\/conversations$/, { timeout: 10_000 });

    // The conversation disappears from Alice's sidebar entirely.
    await pageA.reload();
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
    await expect(pageA.getByTestId("conversation-row-0")).not.toBeVisible({ timeout: 10_000 });

    // ── 6. Bob sees the "Alice left the chat" system event in the timeline ───
    await expect(pageBob.getByTestId("system-event-left")).toContainText(
      "Alice left the chat",
      { timeout: 20_000 },
    );
  } finally {
    await ctxA.close();
    if (ctxBob) await ctxBob.close();
    if (ctxCharlie) await ctxCharlie.close();
  }
});
