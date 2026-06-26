import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

/**
 * E2E: Slice 8 unread badges — badge appears, count grows, clears on open.
 *
 * Adapted to the canonical contact-invitation pairing flow used by
 * messaging-1to1 and conversation-auto-discovery specs:
 *   1. Alice + Bob create accounts.
 *   2. Bob generates a /contacts/add invite URL; Alice opens and accepts.
 *   3. Alice opens Bob's contact, starts a chat, sends N messages.
 *   4. Bob's sidebar (after navigating to /conversations) should show an
 *      unread badge with the right count and the row should be bold.
 *   5. Bob clicks the conversation → the row un-bolds and the badge clears
 *      after returning to the sidebar (markRead fires via the detail route).
 */
test("Slice 8 — badge appears, count grows, clears on open", async ({ browser }) => {
  test.setTimeout(180_000);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    // ── 1. Account creation ──────────────────────────────────────────────────
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    // ── 2. Mutual contacts via invite flow ──────────────────────────────────
    await establishContact(pageB, pageA, "Bob");

    // ── 3. Alice starts a chat with Bob and sends 3 messages ────────────────
    await openDirectChat(pageA, "Bob");

    for (let i = 1; i <= 3; i++) {
      await pageA.getByTestId("composer-input").fill(`msg ${i}`);
      await pageA.getByTestId("composer-send-btn").click();
      await expect(pageA.getByTestId("message-timeline")).toContainText(`msg ${i}`, {
        timeout: 5_000,
      });
    }

    // ── 4. Bob's sidebar shows the badge with count 3 + row is bold ─────────
    await pageB.goto("/conversations");
    await expect(pageB.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 30_000,
    });

    const badge = pageB.getByTestId("unread-badge-0");
    await expect(badge).toBeVisible({ timeout: 30_000 });
    await expect(badge).toHaveText("3", { timeout: 15_000 });

    const row = pageB.getByTestId("conversation-row-0");
    // The unread bold styling lives on the name span, not the row anchor.
    await expect(pageB.getByTestId("conversation-name-0")).toHaveClass(/font-semibold/);

    // ── 5. Bob opens the conversation → markRead fires, badge clears ────────
    await row.click();
    await expect(pageB.getByTestId("conversation-detail")).toBeVisible({
      timeout: 10_000,
    });
    // Wait for at least one message to render so we know the route fully
    // hydrated and markRead's useEffect ran.
    await expect(pageB.getByTestId("message-timeline")).toContainText("msg 3", {
      timeout: 15_000,
    });

    // Go back to the sidebar list and verify badge is gone + row no longer bold.
    await pageB.goto("/conversations");
    await expect(pageB.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 10_000,
    });
    await expect(pageB.getByTestId("unread-badge-0")).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(pageB.getByTestId("conversation-name-0")).not.toHaveClass(
      /font-semibold/,
    );
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
