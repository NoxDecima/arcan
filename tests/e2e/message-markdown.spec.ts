import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

/**
 * E2E: a sent message body rendered as markdown.
 *
 * Message bodies render through <MessageMarkdown> (react-markdown + remark-gfm),
 * emitted inside a `[data-testid="message-markdown"]` wrapper in the bubble.
 * This asserts that a markdown source sent through the real composer renders as
 * formatted elements (heading, list items, a task-list checkbox, bold, inline
 * code) on the sender's own timeline.
 *
 * Setup mirrors messaging-1to1.spec.ts: two paired accounts, conversation open
 * on the sender (Alice). Only the sender side is exercised — cross-context sync
 * is already covered by messaging-1to1.
 */
test("a sent markdown message renders formatted", async ({ browser }) => {
  test.setTimeout(120_000); // generous timeout for cross-context Jazz sync

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  try {
    // Account creation
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    // Establish mutual contacts (Bob invites, Alice connects, Bob approves)
    await establishContact(pageB, pageA, "Bob");

    // Alice opens the 1:1 conversation with Bob
    await openDirectChat(pageA, "Bob");
    await expect(pageA.getByTestId("conversation-title")).toContainText("Bob", {
      timeout: 5_000,
    });

    // Alice sends a markdown message. `.fill()` sets the input value directly,
    // preserving the newlines the markdown needs (block boundaries).
    const composer = pageA.getByTestId("composer-input");
    await composer.fill("# Head\n\n- one\n- [ ] todo\n\n**bold** and `code`");
    await pageA.getByTestId("composer-send-btn").click();

    // The rendered markdown wrapper for the most recent message.
    const md = pageA.getByTestId("message-markdown").last();
    await expect(md).toBeVisible({ timeout: 10_000 });

    await expect(md.locator("h1")).toHaveText("Head");
    // `- one` (plain) + `- [ ] todo` (task) = 2 list items; the task item
    // carries a single disabled checkbox.
    await expect(md.locator("li")).toHaveCount(2);
    await expect(md.locator('input[type="checkbox"]')).toHaveCount(1);
    await expect(md.locator("strong")).toHaveText("bold");
    await expect(md.locator("code")).toHaveText("code");
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
