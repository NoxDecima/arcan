import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";
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

  await page.goto("/contacts/add");
  await expect(page.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
  const inviteUrl = (await page.getByTestId("qr-url-text").textContent())!.trim();

  // Navigate Alice to a neutral page first to ensure the InviteRoute re-mounts
  // cleanly when accepting multiple invites back-to-back.
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

    // ── 3. Alice starts a 1:1 chat with Bob (single-contact picker → DM) ─────
    await pageA.goto("/conversations");
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
    await pageA.getByTestId("new-chat-btn").click();
    await expect(pageA.getByTestId("contact-picker-overlay")).toBeVisible({
      timeout: 5_000,
    });

    // Identify Bob's row (order is non-deterministic) and select only Bob
    const row0Text = await pageA.getByTestId("contact-picker-row-0").textContent();
    const bobIsRow0 = row0Text?.toLowerCase().includes("bob");
    if (bobIsRow0) {
      await pageA.getByTestId("contact-picker-row-0").click();
    } else {
      await pageA.getByTestId("contact-picker-row-1").click();
    }
    // 1 contact selected → DM with Bob
    await pageA.getByTestId("contact-picker-continue").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 15_000 });

    // ── 4. Navigate to MembersRoute and add Charlie ──────────────────────────
    await pageA.getByTestId("members-link").click();
    await expect(pageA.getByTestId("members-route")).toBeVisible({ timeout: 5_000 });

    const membersList = pageA.getByTestId("members-list");
    await expect(membersList).toBeVisible({ timeout: 5_000 });

    // Open the "Add member" ContactPicker — Bob should be excluded
    await pageA.getByTestId("add-member-btn").click();
    await expect(pageA.getByTestId("contact-picker-overlay")).toBeVisible({
      timeout: 5_000,
    });

    // Only Charlie should be available (Bob is excluded as existing member)
    const pickerItems = pageA.locator('[data-testid^="contact-picker-row-"]');
    await expect(pickerItems).toHaveCount(1, { timeout: 5_000 });

    await pageA.getByTestId("contact-picker-row-0").click();
    await pageA.getByTestId("contact-picker-continue").click();

    // Charlie's row appears in the members list
    await expect(membersList).toContainText("Charlie", { timeout: 15_000 });

    // Extract Charlie's accountID from the member row testid
    const charlieRow = membersList.locator('[data-testid^="member-row-"]').filter({
      hasText: "Charlie",
    });
    await expect(charlieRow).toBeVisible({ timeout: 5_000 });
    const charlieTestId = await charlieRow.getAttribute("data-testid");
    const charlieAccountID = charlieTestId?.replace("member-row-", "") ?? "";
    expect(charlieAccountID).not.toBe("");

    // ── 5. Charlie's sidebar discovers the conversation via Inbox ────────────
    await pageCharlie.goto("/conversations");
    await expect(pageCharlie.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 30_000,
    });

    // ── 6. Charlie can send a message ────────────────────────────────────────
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

    // Alice (currently on MembersRoute) navigates back to conversation to see the message
    await pageA.getByTestId("back-btn").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 5_000 });
    await expect(pageA.getByTestId("message-timeline")).toContainText(
      "Hello from Charlie",
      { timeout: 20_000 },
    );

    // ── 7. Alice removes Charlie from the conversation ────────────────────────
    await pageA.getByTestId("members-link").click();
    await expect(pageA.getByTestId("members-route")).toBeVisible({ timeout: 5_000 });

    pageA.once("dialog", (dialog) => dialog.accept());
    await pageA.getByTestId(`remove-${charlieAccountID}`).click();

    // Charlie's row disappears from Alice's members list
    await expect(
      pageA.getByTestId(`member-row-${charlieAccountID}`),
    ).not.toBeVisible({ timeout: 10_000 });

    // Bob's MembersRoute also does not show Charlie
    const membersUrl = pageA.url();
    await pageBob.goto(membersUrl);
    await expect(pageBob.getByTestId("members-route")).toBeVisible({ timeout: 10_000 });
    await expect(
      pageBob.getByTestId(`member-row-${charlieAccountID}`),
    ).not.toBeVisible({ timeout: 10_000 });

    // ── 8. Charlie's sidebar no longer shows the conversation ─────────────────
    // Jazz revokes Charlie's crypto access; the conversation should not appear
    // in the sidebar after role becomes "revoked".
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
