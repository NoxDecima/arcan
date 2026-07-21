import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

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
 *   c) useInboxDispatcher in App.tsx (the single inbox subscription) routes the
 *      payload to handleConversationNotification, which loads the Conversation
 *      by ID and pushes it to me.root.knownConversations
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
    await establishContact(pageB, pageA, "Bob");

    // ── 3. Alice opens Bob's contact and starts a chat ───────────────────────
    await openDirectChat(pageA, "Bob");

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
