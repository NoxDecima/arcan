import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

/**
 * E2E: 1:1 Messaging happy path
 *
 * Two browser contexts as mutual contacts run through the full lifecycle:
 *   1. Establish mutual contacts via invite flow
 *   2. Alice starts a chat with Bob from contact detail
 *   3. Alice sends a message; it appears in her own timeline
 *   4. Bob opens the conversation and sees Alice's message
 *   5. Bob replies; Alice sees the reply
 *   6. Alice edits her first message; Bob sees "(edited)" + new text
 *   7. Alice deletes her first message; Bob sees the deleted placeholder
 *
 * Cross-context Jazz sync may take several seconds, so generous timeouts
 * (10-15s) are used on cross-context assertions.
 */
test("1:1 messaging — send, receive, edit, delete", async ({ browser }) => {
  test.setTimeout(120_000); // generous timeout for cross-context Jazz sync

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

    // ── 2. Establish mutual contacts (Bob invites, Alice connects, Bob approves) ─
    await establishContact(pageB, pageA, "Bob");

    // ── 3. Alice starts a chat with Bob from his profile ─────────────────────
    await openDirectChat(pageA, "Bob");
    await expect(pageA.getByTestId("conversation-title")).toContainText("Bob", {
      timeout: 5_000,
    });

    // ── 4. Alice sends "Hey Bob" ─────────────────────────────────────────────
    await pageA.getByTestId("composer-input").fill("Hey Bob");
    await pageA.getByTestId("composer-send-btn").click();

    // Alice sees the message in her own timeline
    await expect(pageA.getByTestId("message-timeline")).toContainText("Hey Bob", {
      timeout: 5_000,
    });
    await expect(pageA.getByTestId("message-mine")).toBeVisible();

    // ── 5. Bob navigates to the conversation and sees Alice's message ────────
    // The sidebar derives conversations from contactBook.linkedConversation refs.
    // Alice set her contact's linkedConversation when she created the conversation,
    // but Bob's contact for Alice still has linkedConversation = null until Bob
    // also clicks "Start chat" (which would invoke the defensive scan / cache).
    //
    // Workaround: since both contexts are in the same test, we grab the
    // conversation URL from Alice's page and navigate Bob directly to it.
    // Bob is a member of the ConversationGroup so Jazz will load it for him.
    const aliceConvUrl = pageA.url();

    await pageB.goto(aliceConvUrl);

    // Bob sees the conversation detail with Alice's message
    await expect(pageB.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });
    await expect(pageB.getByTestId("message-timeline")).toContainText("Hey Bob", {
      timeout: 15_000,
    });

    // ── 6. Bob replies ───────────────────────────────────────────────────────
    await pageB.getByTestId("composer-input").fill("Hi Alice!");
    await pageB.getByTestId("composer-send-btn").click();

    await expect(pageB.getByTestId("message-timeline")).toContainText("Hi Alice!", {
      timeout: 5_000,
    });

    // Alice sees Bob's reply
    await expect(pageA.getByTestId("message-timeline")).toContainText("Hi Alice!", {
      timeout: 15_000,
    });

    // ── 7. Alice edits "Hey Bob" → "Hey Bob! (edited)" ──────────────────────
    // Find Alice's own message and open the message menu
    const aliceMsg = pageA.getByTestId("message-mine").first();
    await aliceMsg.hover();
    await pageA.getByTestId("message-menu-btn").first().click();
    await pageA.getByTestId("message-edit-btn").click();

    // Fill new text in the edit input
    await pageA.getByTestId("message-edit-input").fill("Hey Bob! (edited)");
    await pageA.getByTestId("message-edit-save").click();

    // Alice sees the edited text + (edited) indicator
    await expect(pageA.getByTestId("message-timeline")).toContainText("Hey Bob! (edited)", {
      timeout: 5_000,
    });
    await expect(pageA.getByTestId("message-timeline")).toContainText("(edited)", {
      timeout: 5_000,
    });

    // Bob sees the edited version.
    // Jazz sync for edits on existing messages in cross-context scenarios can
    // be slow. Give it 30s first; if still not visible, reload Bob's page.
    const bobSeeEdit = async () => {
      await expect(pageB.getByTestId("message-timeline")).toContainText("Hey Bob! (edited)", {
        timeout: 30_000,
      });
    };
    try {
      await bobSeeEdit();
    } catch {
      // Reload Bob's page to force fresh Jazz state reconciliation
      await pageB.reload();
      await expect(pageB.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });
      await expect(pageB.getByTestId("message-timeline")).toContainText("Hey Bob! (edited)", {
        timeout: 15_000,
      });
    }
    await expect(pageB.getByTestId("message-timeline")).toContainText("(edited)", {
      timeout: 10_000,
    });

    // ── 8. Alice deletes her message ─────────────────────────────────────────
    const aliceMsgAfterEdit = pageA.getByTestId("message-mine").first();
    await aliceMsgAfterEdit.hover();
    await pageA.getByTestId("message-menu-btn").first().click();

    // Click delete and confirm the browser dialog
    pageA.once("dialog", (dialog) => dialog.accept());
    await pageA.getByTestId("message-delete-btn").click();

    // Alice sees the deleted placeholder
    await expect(pageA.getByTestId("message-deleted")).toBeVisible({ timeout: 5_000 });
    await expect(pageA.getByTestId("message-timeline")).toContainText(
      "message deleted",
      { timeout: 5_000 },
    );

    // Bob also sees the deleted placeholder.
    // If sync is slow, reload Bob's page to force fresh state.
    const bobSeeDelete = async () => {
      await expect(pageB.getByTestId("message-deleted")).toBeVisible({ timeout: 20_000 });
    };
    try {
      await bobSeeDelete();
    } catch {
      await pageB.reload();
      await expect(pageB.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });
      await expect(pageB.getByTestId("message-deleted")).toBeVisible({ timeout: 15_000 });
    }
    await expect(pageB.getByTestId("message-timeline")).toContainText(
      "message deleted",
      { timeout: 10_000 },
    );
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
