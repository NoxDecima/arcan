import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * E2E: Archive after self-leave (Slice 4)
 *
 * Alice and Bob are mutual contacts in a 1:1 conversation. Alice leaves.
 * Assertions:
 * - Alice's active conversation list does NOT show the conversation
 * - Alice's sidebar shows an "Archived (1)" section header
 * - Expanding the section reveals the archived row
 * - Opening the archived conversation shows the archived banner; composer is gone
 */
test("self-leave lands conversation in archive section (Slice 4)", async ({ browser }) => {
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

    // ── 2. Establish mutual contacts (Bob generates invite, Alice accepts) ──
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

    // ── 3. Alice starts a 1:1 with Bob and sends a message ──────────────────
    await pageA.goto("/contacts");
    await expect(pageA.getByTestId("contacts-page-list")).toContainText("Bob", {
      timeout: 10_000,
    });
    await pageA.getByTestId("contacts-page-row-0").click();
    await expect(pageA.getByTestId("start-chat-btn")).toBeVisible({ timeout: 5_000 });
    await pageA.getByTestId("start-chat-btn").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });

    await pageA.getByTestId("composer-input").fill("Hello Bob");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText("Hello Bob", {
      timeout: 5_000,
    });

    // Wait for Alice's message to appear in her own timeline (confirms send succeeded)
    await expect(pageA.getByTestId("message-timeline")).toContainText("Hello Bob", {
      timeout: 5_000,
    });

    // ── 4. Alice leaves the conversation ────────────────────────────────────
    // In a 1:1 both are admin so no promote dialog; plain confirm
    pageA.once("dialog", (dialog) => dialog.accept());
    await pageA.getByTestId("members-link").click();
    await expect(pageA.getByTestId("members-route")).toBeVisible({ timeout: 5_000 });
    await pageA.getByTestId("leave-conversation-btn").click();

    // Alice is navigated to /conversations
    await expect(pageA).toHaveURL(/\/conversations$/, { timeout: 10_000 });

    // ── 5. Active list: conversation is NOT shown ────────────────────────────
    await expect(pageA.getByTestId("conversation-row-0")).not.toBeVisible({
      timeout: 5_000,
    });

    // ── 6. Archived section: header shows "Archived (1)" ────────────────────
    const archivedHeader = pageA.getByTestId("archived-section-header");
    await expect(archivedHeader).toBeVisible({ timeout: 10_000 });
    await expect(archivedHeader).toHaveText(/Archived \(1\)/);

    // ── 7. Expand and verify the row is in the archived section ─────────────
    await archivedHeader.click();
    await expect(pageA.getByTestId("archived-section-list")).toBeVisible();
    await expect(pageA.getByTestId("archived-row-0")).toBeVisible();

    // ── 8. Open the archived conversation: banner shown, composer hidden ─────
    await pageA.getByTestId("archived-row-0").locator("a").click();
    await expect(pageA.getByTestId("archived-banner")).toBeVisible({ timeout: 5_000 });
    await expect(pageA.getByTestId("composer-input")).not.toBeVisible();
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
