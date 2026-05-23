import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * E2E: Bob's sidebar auto-discovers a conversation Alice created
 *
 * Tests the Inbox-based auto-discovery introduced in Slice 3a Issue 1.
 * Alice creates a 1:1 conversation with Bob; Bob's sidebar should show
 * the conversation WITHOUT Bob explicitly navigating to the conversation URL.
 *
 * Implementation:
 *   1. Alice and Bob become mutual contacts via the invite flow
 *   2. Alice opens Bob's contact and clicks "Start chat"
 *   3. Alice sends "Hello Bob"
 *   4. Bob navigates to /conversations — his sidebar should show the conversation
 *      (populated via Inbox subscription, not manual navigation)
 *   5. Bob clicks the row and sees Alice's message
 *
 * Bob's inbox subscription fires because:
 *   a) applyMigration (jazz framework) auto-creates inbox on account startup
 *   b) findOrCreate1to1Conversation sends a ConversationNotification via InboxSender
 *   c) useConversationInboxSubscription in App.tsx receives it, loads the
 *      Conversation by ID, and sets Contact.linkedConversation
 */
test("Bob's sidebar auto-discovers a conversation Alice created", async ({
  browser,
}) => {
  test.setTimeout(180_000); // generous timeout for cross-context Jazz sync + inbox delivery

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  try {
    // ── 1. Account creation ──────────────────────────────────────────────────
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    // ── 2. Establish mutual contacts (Bob generates invite, Alice accepts) ───
    await pageB.goto("/contacts/add");
    await expect(pageB.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();

    await pageA.goto(inviteUrl);
    await expect(pageA.getByTestId("invite-inviter-name")).toContainText("Bob", {
      timeout: 10_000,
    });
    await pageA.getByTestId("invite-accept-btn").click();
    await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 10_000 });

    // Wait for Bob to detect that Alice accepted his invite
    await expect(pageB.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });

    // ── 3. Alice opens Bob's contact and starts a chat ───────────────────────
    await pageA.goto("/contacts");
    await expect(pageA.getByTestId("contacts-page-list")).toContainText("Bob", {
      timeout: 10_000,
    });
    await pageA.getByTestId("contacts-page-row-0").click();
    await expect(pageA.getByTestId("start-chat-btn")).toBeVisible({ timeout: 5_000 });
    await pageA.getByTestId("start-chat-btn").click();

    // Alice lands on the conversation detail page
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });

    // ── 4. Alice sends "Hello Bob" ────────────────────────────────────────────
    await pageA.getByTestId("composer-input").fill("Hello Bob");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText("Hello Bob", {
      timeout: 5_000,
    });

    // ── 5. KEY ASSERTION: Bob's sidebar shows the conversation ───────────────
    // Bob has NOT explicitly navigated to the conversation URL.
    // The Inbox subscription should populate Contact.linkedConversation which
    // the sidebar derives its list from. We navigate Bob to /conversations
    // and wait for conversation-row-0 to appear.
    await pageB.goto("/conversations");
    await expect(pageB.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 30_000, // generous — inbox delivery + CoValue sync can take a few seconds
    });

    // ── 6. Bob clicks the conversation and sees Alice's message ──────────────
    await pageB.getByTestId("conversation-row-0").click();
    await expect(pageB.getByTestId("message-timeline")).toContainText("Hello Bob", {
      timeout: 15_000,
    });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
