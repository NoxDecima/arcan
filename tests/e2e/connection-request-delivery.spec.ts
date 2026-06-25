import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * E2E regression (Unit 9-0): a connection request must survive the recipient's
 * navigation to /connections/pending.
 *
 * Root cause this guards against: jazz-tools' Inbox delivery is one-shot +
 * destructive (each message is marked `processed` in a persisted stream after
 * first delivery). The request used to be surfaced via ephemeral
 * component-local useState fed by a per-consumer inbox subscription. The
 * app-wide IncomingConnectionPrompt mounted first, consumed + marked-processed
 * the request, then navigating to /connections/pending (a full reload) remounted
 * the hook with empty state and a fresh subscription that skipped the
 * already-processed message → the request was lost from the UI forever.
 *
 * The fix drains the inbox exactly once (app level) into the durable
 * me.root.incomingRequests CoList; both the prompt and the pending route read
 * from that list. This test asserts the request is still present AFTER a full
 * page navigation/reload — the exact scenario that was broken.
 */
test("connection request survives navigation to /connections/pending", async ({
  browser,
}) => {
  // Bob (recipient): signs up, opens /contacts/add, exposes a "link"-channel invite.
  const bobCtx = await browser.newContext();
  const bob = await bobCtx.newPage();

  // Alice (requester): signs up, opens the invite, accepts → mints the request.
  const aliceCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();

  try {
    await createAccount(bob, "Bob");
    await bob.goto("/contacts/add");
    await expect(bob.getByTestId("qr-url-text")).toBeVisible({ timeout: 15_000 });
    const inviteUrl = (await bob.getByTestId("qr-url-text").textContent())!.trim();
    expect(inviteUrl).toContain("/invite#");

    await createAccount(alice, "Alice");
    await alice.goto(inviteUrl);
    await expect(alice.getByTestId("invite-inviter-name")).toContainText("Bob", {
      timeout: 15_000,
    });
    await alice.getByTestId("invite-accept-btn").click();
    await expect(alice.getByTestId("invite-sent")).toBeVisible({ timeout: 30_000 });

    // Bob is sitting on /contacts/add while the request arrives — the app-level
    // subscription drains it into the durable list. Now NAVIGATE to the pending
    // surface (a full reload that previously reset the ephemeral state). The
    // request must still surface from the durable list.
    await expect(async () => {
      await bob.goto("/connections/pending");
      await expect(bob.getByTestId("pending-request-row").first()).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 30_000 });

    // And it shows who is requesting.
    await expect(
      bob.locator('[data-pending-request-row="true"]').first(),
    ).toContainText("Alice");

    // Reload once more — durable persistence must keep it visible.
    await bob.reload();
    await expect(bob.getByTestId("pending-request-row").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(bob.getByTestId("pending-empty")).toHaveCount(0);
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});
