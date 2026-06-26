import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

/**
 * E2E: Slice 8 tab title badge — title prefix `(N) ` appears when the
 * tab is hidden + unread > 0, and goes back to the plain baseTitle when
 * visible (or unread = 0).
 *
 * We force document.hidden via Object.defineProperty + dispatch a
 * visibilitychange event because Playwright can't put a page in the
 * background while keeping the test runner driving it. See
 * useTabTitleBadge.test.ts for the analogous unit-test pattern.
 */
test("Slice 8 — title gains (N) prefix when hidden + unread > 0", async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageAlice = await ctxA.newPage();
  const pageBob = await ctxB.newPage();

  try {
    await pageAlice.goto("/");
    await createAccount(pageAlice, "Alice");

    await pageBob.goto("/");
    await createAccount(pageBob, "Bob");

    // Pair via Bob's invite.
    await establishContact(pageBob, pageAlice, "Bob");

    // Bob navigates to /conversations and forces "hidden" BEFORE Alice sends.
    // The NotificationManager (mounted in App.tsx) will then react via
    // useTabTitleBadge when totalUnread > 0.
    await pageBob.goto("/conversations");
    await pageBob.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Alice opens a 1:1 with Bob and sends 2 messages.
    await openDirectChat(pageAlice, "Bob");
    await pageAlice.getByTestId("composer-input").fill("hi 1");
    await pageAlice.getByTestId("composer-send-btn").click();
    await expect(pageAlice.getByTestId("message-timeline")).toContainText("hi 1", {
      timeout: 5_000,
    });
    await pageAlice.getByTestId("composer-input").fill("hi 2");
    await pageAlice.getByTestId("composer-send-btn").click();
    await expect(pageAlice.getByTestId("message-timeline")).toContainText("hi 2", {
      timeout: 5_000,
    });

    // Bob's title should show "(2) Arcan".
    await expect
      .poll(async () => pageBob.title(), { timeout: 30_000 })
      .toMatch(/^\(2\)\s/);

    // Flip back to visible → title resets to plain.
    await pageBob.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect
      .poll(async () => pageBob.title(), { timeout: 10_000 })
      .not.toMatch(/^\(/);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
