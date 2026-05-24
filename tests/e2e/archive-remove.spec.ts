import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * E2E: Archive X-button removes conversation entirely (Slice 4)
 *
 * Alice and Bob are in a 1:1 conversation. Alice leaves (conversation lands in
 * archive). Alice then hovers the archived row and clicks the X button.
 * Assertions:
 * - Archived section disappears (no more archived conversations)
 * - Conversation is gone from both active and archived lists
 */
test("X button on archived row removes conversation from knownConversations entirely (Slice 4)", async ({
  browser,
}) => {
  test.setTimeout(120_000);

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  try {
    // ── 1. Create accounts ──────────────────────────────────────────────────
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    // ── 2. Establish mutual contacts ─────────────────────────────────────────
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

    // ── 3. Alice starts a conversation with Bob ──────────────────────────────
    await pageA.goto("/contacts");
    await expect(pageA.getByTestId("contacts-page-list")).toContainText("Bob", {
      timeout: 10_000,
    });
    await pageA.getByTestId("contacts-page-row-0").click();
    await expect(pageA.getByTestId("start-chat-btn")).toBeVisible({ timeout: 5_000 });
    await pageA.getByTestId("start-chat-btn").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });

    await pageA.getByTestId("composer-input").fill("Hi");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText("Hi", {
      timeout: 5_000,
    });

    // Bob opens the conversation to confirm it synced
    const aliceConvUrl = pageA.url();
    await pageB.goto(aliceConvUrl);
    await expect(pageB.getByTestId("message-timeline")).toContainText("Hi", {
      timeout: 15_000,
    });

    // ── 4. Alice leaves the conversation ────────────────────────────────────
    pageA.once("dialog", (dialog) => dialog.accept());
    await pageA.getByTestId("members-link").click();
    await expect(pageA.getByTestId("members-route")).toBeVisible({ timeout: 5_000 });
    await pageA.getByTestId("leave-conversation-btn").click();
    await expect(pageA).toHaveURL(/\/conversations$/, { timeout: 10_000 });

    // ── 5. Archived section appears ──────────────────────────────────────────
    const archivedHeader = pageA.getByTestId("archived-section-header");
    await expect(archivedHeader).toBeVisible({ timeout: 10_000 });
    await archivedHeader.click();
    await expect(pageA.getByTestId("archived-row-0")).toBeVisible();

    // ── 6. Click the X button to remove from archive ─────────────────────────
    // The X button has opacity-0 normally and opacity-100 on hover; click it
    // directly via testid even without a visible hover state in headless mode
    pageA.once("dialog", (dialog) => dialog.accept());
    await pageA.getByTestId("archived-remove-0").click({ force: true });

    // ── 7. Archived section header disappears (no more archived entries) ──────
    await expect(pageA.getByTestId("archived-section-header")).not.toBeVisible({
      timeout: 5_000,
    });

    // ── 8. Conversation is not in the active list either ─────────────────────
    await expect(pageA.getByTestId("conversation-row-0")).not.toBeVisible({
      timeout: 3_000,
    });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
