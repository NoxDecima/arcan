import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * E2E: Group conversation creation
 *
 * Three users (Alice, Bob, Charlie) are paired. Alice opens the sidebar "+"
 * picker, multi-selects Bob AND Charlie, clicks Continue, sees GroupCreateDialog,
 * types "Trip planning", and submits.
 *
 * Assertions:
 *   1. Alice navigates to the new group conversation
 *   2. Bob and Charlie's sidebars (via Inbox auto-discovery) eventually show
 *      "Trip planning" in their conversation list
 *   3. All three can send messages and the others see them
 *   4. The group title appears in each user's conversation list
 *
 * Pattern: multi-context; each "user" is a separate BrowserContext with its
 * own Jazz account. Pairing uses the same invite flow as existing tests.
 */

/**
 * Helper: create a new account in a fresh context and accept an invite from
 * alicePage. Returns the context and page.
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

  // Generate invite URL from this user's side
  await page.goto("/contacts/add");
  await expect(page.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
  const inviteUrl = (await page.getByTestId("qr-url-text").textContent())!.trim();

  // Alice accepts the invite.
  // Navigate to a neutral page first to ensure the InviteRoute re-mounts
  // cleanly (the component keeps phase state, so navigating from one /invite#
  // URL to another without an intermediate stop leaves it in "accepted" phase).
  await pageA.goto("/conversations");
  await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
  await pageA.goto(inviteUrl);
  await expect(pageA.getByTestId("invite-inviter-name")).toContainText(name, {
    timeout: 15_000,
  });
  await pageA.getByTestId("invite-accept-btn").click();
  await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 15_000 });

  // Wait for the other side to detect acceptance
  await expect(page.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });

  return { ctx, page };
}

test("group conversation create — multi-select picker, title, discovery, messaging", async ({
  browser,
}) => {
  test.setTimeout(240_000); // generous; three contexts + inbox delivery + multiple asserts

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  let ctxBob: BrowserContext | null = null;
  let ctxCharlie: BrowserContext | null = null;

  try {
    // ── 1. Create Alice ─────────────────────────────────────────────────────
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    // ── 2. Pair Alice with Bob, then with Charlie ────────────────────────────
    const { ctx: _ctxBob, page: pageBob } = await pairWith(browser, pageA, "Bob");
    ctxBob = _ctxBob;

    const { ctx: _ctxCharlie, page: pageCharlie } = await pairWith(
      browser,
      pageA,
      "Charlie",
    );
    ctxCharlie = _ctxCharlie;

    // ── 3. Alice opens picker, selects Bob + Charlie, continues ─────────────
    await pageA.goto("/conversations");
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });

    // Open the new-chat ContactPicker
    await pageA.getByTestId("new-chat-btn").click();
    await expect(pageA.getByTestId("contact-picker-overlay")).toBeVisible({
      timeout: 5_000,
    });

    // Select first contact (index 0) — this is Bob or Charlie, order may vary
    await pageA.getByTestId("contact-picker-row-0").click();
    await expect(pageA.getByTestId("contact-picker-row-0")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Select second contact (index 1)
    await pageA.getByTestId("contact-picker-row-1").click();
    await expect(pageA.getByTestId("contact-picker-row-1")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Verify the count helper text shows 2 selected
    await expect(pageA.getByTestId("contact-picker-count")).toContainText("2 contacts");

    // Click Continue to advance to GroupCreateDialog
    await pageA.getByTestId("contact-picker-continue").click();

    // ── 4. GroupCreateDialog: type title and submit ──────────────────────────
    await expect(pageA.getByTestId("group-create-overlay")).toBeVisible({
      timeout: 5_000,
    });
    await pageA.getByTestId("group-create-title-input").fill("Trip planning");
    await pageA.getByTestId("group-create-submit").click();

    // ── 5. Alice lands on the new group conversation ─────────────────────────
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({
      timeout: 15_000,
    });
    await expect(pageA.getByTestId("conversation-title")).toContainText("Trip planning", {
      timeout: 5_000,
    });

    // ── 6. Bob's sidebar discovers the group via Inbox ───────────────────────
    await pageBob.goto("/conversations");
    await expect(pageBob.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 30_000,
    });
    await expect(pageBob.getByTestId("conversation-row-0")).toContainText("Trip planning");

    // ── 7. Charlie's sidebar discovers the group via Inbox ───────────────────
    await pageCharlie.goto("/conversations");
    await expect(pageCharlie.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 30_000,
    });
    await expect(pageCharlie.getByTestId("conversation-row-0")).toContainText(
      "Trip planning",
    );

    // ── 8. Alice sends a message; Bob and Charlie see it ────────────────────
    await pageA.getByTestId("composer-input").fill("First message from Alice");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText(
      "First message from Alice",
      { timeout: 5_000 },
    );

    // Navigate Bob to the conversation via his sidebar row
    await pageBob.getByTestId("conversation-row-0").click();
    await expect(pageBob.getByTestId("conversation-detail")).toBeVisible({
      timeout: 10_000,
    });
    await expect(pageBob.getByTestId("message-timeline")).toContainText(
      "First message from Alice",
      { timeout: 20_000 },
    );

    // Navigate Charlie to the conversation via his sidebar row
    await pageCharlie.getByTestId("conversation-row-0").click();
    await expect(pageCharlie.getByTestId("conversation-detail")).toBeVisible({
      timeout: 10_000,
    });
    await expect(pageCharlie.getByTestId("message-timeline")).toContainText(
      "First message from Alice",
      { timeout: 20_000 },
    );

    // ── 9. Bob sends a message; Alice and Charlie see it ─────────────────────
    await pageBob.getByTestId("composer-input").fill("Hello from Bob");
    await pageBob.getByTestId("composer-send-btn").click();
    await expect(pageBob.getByTestId("message-timeline")).toContainText("Hello from Bob", {
      timeout: 5_000,
    });

    await expect(pageA.getByTestId("message-timeline")).toContainText("Hello from Bob", {
      timeout: 20_000,
    });
    await expect(pageCharlie.getByTestId("message-timeline")).toContainText(
      "Hello from Bob",
      { timeout: 20_000 },
    );

    // ── 10. Charlie sends a message; Alice and Bob see it ────────────────────
    await pageCharlie.getByTestId("composer-input").fill("Hey everyone, Charlie here");
    await pageCharlie.getByTestId("composer-send-btn").click();
    await expect(pageCharlie.getByTestId("message-timeline")).toContainText(
      "Hey everyone, Charlie here",
      { timeout: 5_000 },
    );

    await expect(pageA.getByTestId("message-timeline")).toContainText(
      "Hey everyone, Charlie here",
      { timeout: 20_000 },
    );
    await expect(pageBob.getByTestId("message-timeline")).toContainText(
      "Hey everyone, Charlie here",
      { timeout: 20_000 },
    );
  } finally {
    await ctxA.close();
    if (ctxBob) await ctxBob.close();
    if (ctxCharlie) await ctxCharlie.close();
  }
});
