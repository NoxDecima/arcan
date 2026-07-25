import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

/**
 * E2E: Jump-to-latest button (feedback round 5)
 *
 * Auto-scroll on incoming messages is now gated on "near bottom". When the
 * user has scrolled away, incoming messages no longer yank the view down;
 * instead a floating "jump to latest" button appears with a fixed text label
 * (round 6 relabel — was a numeric count badge). Clicking it returns to the
 * bottom and hides the button.
 *
 *   1. Alice + Bob become mutual contacts; both open the 1:1.
 *   2. Alice floods the timeline so it overflows and becomes scrollable.
 *   3. Alice scrolls her timeline to the top (scrolls away from bottom).
 *   4. Bob sends a message → Alice sees `jump-to-latest` with its text label.
 *   5. Alice clicks it → the button hides (she's back at the bottom).
 *
 * Cross-context Jazz sync can take several seconds, so cross-context
 * assertions use generous timeouts.
 */

/** Count the message rows currently rendered in a page's timeline. */
async function messageRowCount(page: Page): Promise<number> {
  return page
    .getByTestId("message-timeline")
    .locator('[data-testid="message-mine"], [data-testid="message-other"]')
    .count();
}

test("jump-to-latest — scrolled-away user sees label, click returns to bottom", async ({
  browser,
}) => {
  test.setTimeout(180_000); // generous for cross-context Jazz sync + flooding

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  try {
    // ── 1. Accounts + mutual contact ────────────────────────────────────────
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    await establishContact(pageB, pageA, "Bob");

    // Alice opens the 1:1 with Bob (creates the conversation).
    await openDirectChat(pageA, "Bob");
    await expect(pageA.getByTestId("conversation-title")).toContainText("Bob", {
      timeout: 5_000,
    });

    // Bob joins the same conversation via its URL (he's a member of the group).
    const convUrl = pageA.url();
    await pageB.goto(convUrl);
    await expect(pageB.getByTestId("conversation-detail")).toBeVisible({
      timeout: 15_000,
    });

    // ── 2. Alice floods the timeline so it overflows ────────────────────────
    // Enough short messages to guarantee the timeline scrolls past a viewport.
    const FLOOD = 30;
    for (let i = 0; i < FLOOD; i++) {
      await pageA.getByTestId("composer-input").fill(`flood message ${i}`);
      await pageA.getByTestId("composer-send-btn").click();
    }
    // Wait until all flood messages have rendered on Alice's timeline.
    await expect
      .poll(() => messageRowCount(pageA), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(FLOOD);

    // The timeline must actually be scrollable for the jump button to matter.
    await expect
      .poll(
        () =>
          pageA
            .getByTestId("message-timeline")
            .evaluate((el) => el.scrollHeight - el.clientHeight),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(200);

    // The button must NOT be visible while Alice sits at the bottom.
    await expect(pageA.getByTestId("jump-to-latest")).toBeHidden();

    // ── 3. Alice scrolls her timeline to the very top ───────────────────────
    await pageA
      .getByTestId("message-timeline")
      .evaluate((el) => {
        el.scrollTop = 0;
      });
    // Scrolled away → button appears immediately (visible == !isNearBottom).
    await expect(pageA.getByTestId("jump-to-latest")).toBeVisible({
      timeout: 5_000,
    });

    const rowsBeforeBobMsg = await messageRowCount(pageA);

    // ── 4. Bob sends a message → Alice's jump button stays visible ──────────
    await pageB.getByTestId("composer-input").fill("Bob pokes from below");
    await pageB.getByTestId("composer-send-btn").click();
    await expect(pageB.getByTestId("message-timeline")).toContainText(
      "Bob pokes from below",
      { timeout: 10_000 },
    );

    // Bob's message reaches Alice's timeline (she stays scrolled away).
    await expect
      .poll(() => messageRowCount(pageA), { timeout: 30_000 })
      .toBeGreaterThan(rowsBeforeBobMsg);

    // The button shows its fixed "jump to latest" label (round 6 relabel).
    await expect(pageA.getByTestId("jump-to-latest")).toBeVisible();
    await expect(pageA.getByTestId("jump-to-latest")).toContainText(
      "jump to latest",
    );

    // Alice stayed near the top — the incoming message did not yank her down.
    await expect
      .poll(() =>
        pageA
          .getByTestId("message-timeline")
          .evaluate((el) => el.scrollTop),
      )
      .toBeLessThan(200);

    // ── 5. Alice clicks jump-to-latest → button hides ───────────────────────
    await pageA.getByTestId("jump-to-latest").click();
    await expect(pageA.getByTestId("jump-to-latest")).toBeHidden({
      timeout: 10_000,
    });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
