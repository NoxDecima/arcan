import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * E2E: Leave conversation
 *
 * Alice and Bob are mutual contacts; Alice starts a conversation, sends a
 * message, Bob opens it. Then Alice leaves.
 *
 * Slice 4 behavior: after leaving, the conversation is NOT removed from
 * Alice's knownConversations. Instead, it lands in the sidebar's "Archived"
 * section (isArchived returns true once Alice's role is revoked). Alice can
 * later remove it permanently via the X button (see archive-remove.spec.ts).
 *
 * This test asserts:
 *   - Alice is navigated back to /conversations
 *   - The conversation does NOT appear in Alice's active conversation rows
 *   - An "Archived (1)" section header IS visible in the sidebar
 *   - Bob sees the "Alice left the chat" system-event pill in the timeline
 */
test("leave conversation — Alice revokes self, list updates", async ({ browser }) => {
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

    // ── 2. Establish mutual contacts (Bob invites, Alice accepts) ────────────
    await pageB.goto("/contacts/add");
    await expect(pageB.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();

    await pageA.goto(inviteUrl);
    await expect(pageA.getByTestId("invite-inviter-name")).toContainText("Bob", {
      timeout: 10_000,
    });
    await pageA.getByTestId("invite-accept-btn").click();
    await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 10_000 });

    await expect(pageB.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });

    // ── 3. Alice starts chat and sends a message ─────────────────────────────
    await pageA.goto("/contacts");
    await expect(pageA.getByTestId("contacts-page-list")).toContainText("Bob", {
      timeout: 10_000,
    });
    await pageA.getByTestId("contacts-page-row-0").click();
    await expect(pageA.getByTestId("start-chat-btn")).toBeVisible({ timeout: 5_000 });
    await pageA.getByTestId("start-chat-btn").click();

    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });

    await pageA.getByTestId("composer-input").fill("Hello before leaving");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText("Hello before leaving", {
      timeout: 5_000,
    });

    // ── 4. Bob opens the conversation ────────────────────────────────────────
    // The sidebar derives conversations from contactBook.linkedConversation refs.
    // Alice set the ref on her side when creating the conversation, but Bob's
    // contact for Alice has null until Bob explicitly navigates there.
    // Grab the URL from Alice's page and navigate Bob directly to it.
    const aliceConvUrl = pageA.url();

    await pageB.goto(aliceConvUrl);
    await expect(pageB.getByTestId("conversation-detail")).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByTestId("message-timeline")).toContainText("Hello before leaving", {
      timeout: 15_000,
    });

    // ── 5. Alice leaves the conversation ─────────────────────────────────────
    // Leave button is now on the MembersRoute (/conversations/:id/members).
    // Navigate there via the Members link in the detail header.
    await pageA.getByTestId("members-link").click();
    await expect(pageA.getByTestId("members-route")).toBeVisible({ timeout: 5_000 });

    // Accept the confirm dialog
    pageA.once("dialog", (dialog) => dialog.accept());
    await pageA.getByTestId("leave-conversation-btn").click();

    // Alice is navigated to /conversations
    await expect(pageA).toHaveURL(/\/conversations$/, { timeout: 10_000 });

    // Slice 4: active conversation list does NOT show the conversation
    // (it's moved to the Archived section, not the active list)
    await expect(pageA.getByTestId("conversation-row-0")).not.toBeVisible({ timeout: 10_000 });

    // Slice 4: the conversation lives in the Archived section instead
    await expect(pageA.getByTestId("archived-section-header")).toHaveText(
      /Archived \(1\)/,
      { timeout: 10_000 },
    );

    // ── 6. Bob sees the "Alice left the chat" system event in the timeline ──
    // Bob's still-open conversation view should pick up the role-change via
    // Jazz sync and render a centered pill below the messages. The SystemEvent
    // component renders data-testid="system-event-left".
    await expect(
      pageB.getByTestId("system-event-left"),
    ).toContainText("Alice left the chat", { timeout: 15_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
