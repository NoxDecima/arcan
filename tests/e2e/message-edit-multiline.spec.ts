import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

/**
 * E2E: multi-line message edit (feedback round 5).
 *
 * The inline edit control is an auto-growing <textarea>: Enter saves,
 * Shift+Enter inserts a newline, Escape cancels. This spec drives the
 * keyboard newline path end to end:
 *
 *   1. Alice sends "line one".
 *   2. She opens that message's menu → Edit.
 *   3. Caret at end (the ref callback places it there), Shift+Enter for a
 *      newline, type "line two", Enter to save.
 *   4. The rendered bubble body contains both "line one" and "line two".
 *
 * A single account edits its own message; a contact (Bob) exists only so
 * Alice has a conversation to send into (messages are editable only when
 * they are `isMine`). This reuses the exact helpers + testids from
 * messaging-1to1.spec.ts.
 */
test("multi-line message edit — Shift+Enter newline, Enter saves", async ({
  browser,
}) => {
  test.setTimeout(120_000); // generous timeout for cross-context Jazz sync

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  try {
    // ── Setup: two accounts, mutual contact, Alice opens the 1:1 ──────────────
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    await establishContact(pageB, pageA, "Bob");

    await openDirectChat(pageA, "Bob");
    await expect(pageA.getByTestId("conversation-title")).toContainText("Bob", {
      timeout: 5_000,
    });

    // ── Alice sends "line one" ────────────────────────────────────────────────
    await pageA.getByTestId("composer-input").fill("line one");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText("line one", {
      timeout: 5_000,
    });
    await expect(pageA.getByTestId("message-mine")).toBeVisible();

    // ── Open the message menu → Edit ─────────────────────────────────────────
    const aliceMsg = pageA.getByTestId("message-mine").first();
    await aliceMsg.hover();
    await pageA.getByTestId("message-menu-btn").first().click();
    await pageA.getByTestId("message-edit-btn").click();

    // ── Add a second line via the keyboard newline path ──────────────────────
    // The ref callback focuses the textarea and drops the caret at the end, so
    // pressing End then Shift+Enter inserts a newline after "line one".
    const editInput = pageA.getByTestId("message-edit-input");
    await expect(editInput).toBeVisible();
    await editInput.press("End");
    await editInput.press("Shift+Enter");
    await editInput.pressSequentially("line two");
    // Enter (no Shift) saves.
    await editInput.press("Enter");

    // ── The saved bubble body carries both lines ─────────────────────────────
    const bubble = pageA.getByTestId("bubble-body").first();
    await expect(bubble).toContainText("line one", { timeout: 5_000 });
    await expect(bubble).toContainText("line two", { timeout: 5_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
