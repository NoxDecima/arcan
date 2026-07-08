import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

/**
 * 1:1 conversation deletion from the profile danger zone (user decision,
 * 2026-07-09 — walkthrough item 6).
 *
 * The profile page is the 1:1's settings surface (members.tsx redirects
 * 2-person conversations there), so "delete conversation" lives in its
 * danger zone next to "remove contact". Delete = leave the group + forget
 * locally:
 *   - the thread disappears from Alice's sidebar
 *   - Bob keeps his copy and sees the "left" system event
 *   - messaging Bob again starts a FRESH thread (old history stays gone)
 */
test("1:1 delete: thread gone for Alice, 'left' event for Bob, fresh thread on re-message", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    await pageA.goto("/");
    await createAccount(pageA, "Alice");
    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    // Bob invites, Alice connects, Bob approves → mutual contacts.
    await establishContact(pageB, pageA, "Bob");

    // ── 1. Alice messages Bob ────────────────────────────────────────────────
    await openDirectChat(pageA, "Bob");
    await pageA.getByTestId("composer-input").fill("Hey Bob");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText("Hey Bob", {
      timeout: 15_000,
    });

    // Bob auto-discovers the thread and opens it.
    await pageB.goto("/");
    await pageB.getByTestId("conversation-row-0").click();
    await expect(pageB.getByTestId("conversation-detail")).toBeVisible({
      timeout: 15_000,
    });
    await expect(pageB.getByTestId("message-timeline")).toContainText("Hey Bob", {
      timeout: 20_000,
    });

    // ── 2. Alice deletes the conversation from Bob's profile ────────────────
    // The chat header opens conversation settings, which for a 1:1 redirects
    // to the counterpart's profile.
    await pageA.getByTestId("conversation-header-link").click();
    await expect(pageA.getByTestId("profile-view")).toBeVisible({
      timeout: 10_000,
    });
    pageA.on("dialog", (d) => void d.accept());
    await expect(pageA.getByTestId("convo-delete-btn")).toBeVisible({
      timeout: 10_000,
    });
    await pageA.getByTestId("convo-delete-btn").click();

    // The danger zone loses the delete button once the 1:1 is gone.
    await expect(pageA.getByTestId("convo-delete-btn")).not.toBeVisible({
      timeout: 15_000,
    });

    // Thread gone from Alice's sidebar.
    await pageA.goto("/");
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
    await expect(pageA.getByTestId("conversation-row-0")).not.toBeVisible({
      timeout: 10_000,
    });

    // ── 3. Bob keeps his copy + sees the "left" system event ────────────────
    await expect(pageB.getByTestId("system-event-left")).toContainText(
      "Alice left the chat",
      { timeout: 30_000 },
    );
    await expect(pageB.getByTestId("message-timeline")).toContainText("Hey Bob");

    // ── 4. Re-messaging Bob starts a FRESH thread ────────────────────────────
    await openDirectChat(pageA, "Bob");
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({
      timeout: 15_000,
    });
    await expect(pageA.getByTestId("message-timeline")).not.toContainText(
      "Hey Bob",
      { timeout: 5_000 },
    );
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

/**
 * Remove-contact dialog with the "also delete our conversation" checkbox
 * (coupling decision: ask in the confirm).
 */
test("remove contact + checked checkbox deletes the 1:1 too", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    await pageA.goto("/");
    await createAccount(pageA, "Alice");
    await pageB.goto("/");
    await createAccount(pageB, "Bob");
    await establishContact(pageB, pageA, "Bob");

    // Alice messages Bob so a live 1:1 exists.
    await openDirectChat(pageA, "Bob");
    await pageA.getByTestId("composer-input").fill("short-lived");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText(
      "short-lived",
      { timeout: 15_000 },
    );

    // Header → Bob's profile → remove contact, opting into deletion.
    await pageA.getByTestId("conversation-header-link").click();
    await expect(pageA.getByTestId("contact-remove-btn")).toBeVisible({
      timeout: 10_000,
    });
    await pageA.getByTestId("contact-remove-btn").click();
    await expect(pageA.getByTestId("remove-contact-dialog")).toBeVisible({
      timeout: 5_000,
    });
    await pageA.getByTestId("remove-contact-delete-convo").check();
    await pageA.getByTestId("remove-contact-confirm").click();

    // Lands home; neither the contact nor the thread remains.
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 15_000 });
    await expect(pageA.getByTestId("conversation-row-0")).not.toBeVisible({
      timeout: 10_000,
    });
    await pageA.goto("/?tab=contacts");
    await expect(pageA.getByTestId("sidebar-contacts-list")).not.toContainText(
      "Bob",
      { timeout: 10_000 },
    );
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
