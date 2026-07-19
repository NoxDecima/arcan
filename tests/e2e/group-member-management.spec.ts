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
 * E2E: Group member add and remove flows
 *
 * Alice starts a 1:1 chat with Bob, then adds Charlie via the Members route
 * "Add member" button. The ContactPicker shows Bob as excluded (already a member).
 * Finally Alice removes Charlie from the group.
 *
 * Assertions:
 *   Add:
 *   - Charlie's sidebar discovers the conversation via Inbox
 *   - Charlie can send a message; Alice sees it
 *   Remove:
 *   - Alice and Bob's members-list no longer contains Charlie's row
 *   - Charlie's sidebar no longer shows the conversation (role revoked)
 */

/**
 * Helper: create a new account in a fresh context, generate invite URL, have
 * Alice accept. Navigate Alice to a neutral page first to avoid InviteRoute
 * phase collision when accepting multiple invites in sequence.
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

test("group member add and remove flows", async ({ browser }) => {
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

    // ── 3. Alice creates a group with Bob + Charlie ──────────────────────────
    // Unit 9-6: 1:1 conversations redirect to the other user's profile (no DM
    // settings screen), so member add/remove can only be exercised on a group
    // (3+ members). We create the group directly with both contacts; the
    // remove + revocation path below is the unique behaviour under test.
    await createConversation(pageA, ["Bob", "Charlie"], "Member Mgmt Group");
    const convUrl = pageA.url();

    // Read Charlie's accountID from the members route, then return to the chat.
    await openMembers(pageA);
    const charlieAccountID = await memberAccountID(pageA, "Charlie");
    expect(charlieAccountID).not.toBe("");
    await pageA.goto(convUrl);
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });

    // ── 4. Charlie discovers the conversation and sends a message ────────────
    await pageCharlie.goto("/conversations");
    await expect(pageCharlie.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 30_000,
    });
    await pageCharlie.getByTestId("conversation-row-0").click();
    await expect(pageCharlie.getByTestId("conversation-detail")).toBeVisible({
      timeout: 10_000,
    });
    await pageCharlie.getByTestId("composer-input").fill("Hello from Charlie");
    await pageCharlie.getByTestId("composer-send-btn").click();
    await expect(pageCharlie.getByTestId("message-timeline")).toContainText(
      "Hello from Charlie",
      { timeout: 5_000 },
    );

    // Alice (on the conversation) sees Charlie's message.
    await expect(pageA.getByTestId("message-timeline")).toContainText(
      "Hello from Charlie",
      { timeout: 20_000 },
    );

    // Bob opens the conversation so he can observe the removal system event.
    await pageBob.goto(convUrl);
    await expect(pageBob.getByTestId("conversation-detail")).toBeVisible({ timeout: 15_000 });
    await expect(pageBob.getByTestId("message-timeline")).toContainText(
      "Hello from Charlie",
      { timeout: 20_000 },
    );

    // ── 5. Alice removes Charlie from the conversation ───────────────────────
    // Custom in-DOM modal since 36df664; click the confirm button after triggering.
    await openMembers(pageA);
    await memberAction(pageA, charlieAccountID, "remove");
    await pageA.getByTestId("confirm-dialog-confirm").click();

    // Charlie's row is gone from Alice's view (the group drops to a 1:1 and the
    // members route redirects to the remaining member's profile).
    await expect(
      pageA.getByTestId(`member-row-${charlieAccountID}`),
    ).not.toBeVisible({ timeout: 10_000 });

    // ── 6. Bob sees the "removed" system event ───────────────────────────────
    // (Once Charlie is no longer a group member, Bob can't resolve his display
    // name, so the pill reads "Alice removed Unknown from the chat" — assert on
    // the event itself rather than the now-unresolvable target name.)
    await expect(pageBob.getByTestId("system-event-removed")).toContainText(
      "removed",
      { timeout: 20_000 },
    );

    // ── 7. Charlie's sidebar no longer shows the conversation (revocation) ───
    // Jazz revokes Charlie's crypto access; the conversation should not appear
    // in the sidebar after his role becomes "revoked".
    await pageCharlie.goto("/conversations");
    await expect(pageCharlie.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
    await expect(pageCharlie.getByTestId("conversation-row-0")).not.toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await ctxA.close();
    if (ctxBob) await ctxBob.close();
    if (ctxCharlie) await ctxCharlie.close();
  }
});
