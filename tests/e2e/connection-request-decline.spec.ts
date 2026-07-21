import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * E2E regression (feedback round 2, Bundle D): a declined connection request
 * must propagate back to the requester's waiting screen.
 *
 * Root cause guarded: when the recipient denies a pending request,
 * denyConnectionRequest stamps `deniedAt` on the shared ConnectionRequest
 * CoValue (the recipient has writer access — same mechanism approveConnectionRequest
 * uses for approvedAt). The requester's /invite route polls every 3 s; it now
 * checks `deniedAt` and advances to the terminal "request declined" state.
 *
 * Without this fix the requester would be stuck on the "request sent" spinner
 * indefinitely after a decline — the deny action was silent (no propagation).
 */
test("declined connection request reaches the requester's waiting screen", async ({
  browser,
}) => {
  // Bob (inviter/recipient): signs up, opens /contacts/add, exposes invite URL.
  const bobCtx = await browser.newContext();
  const bob = await bobCtx.newPage();

  // Alice (requester): signs up, opens the invite URL, submits request.
  const aliceCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();

  try {
    await createAccount(bob, "Bob");
    await bob.goto("/contacts/add");
    await bob.getByTestId("add-contact-reveal-btn").click();

    // copy-url-text is sr-only — wait for attachment, not visibility.
    await expect(bob.getByTestId("copy-url-text")).toBeAttached({ timeout: 15_000 });
    const inviteUrl = (await bob.getByTestId("copy-url-text").textContent())!.trim();
    expect(inviteUrl).toContain("/invite#");

    await createAccount(alice, "Alice");
    await alice.goto(inviteUrl);
    await expect(alice.getByTestId("invite-inviter-name")).toContainText("Bob", {
      timeout: 15_000,
    });
    await alice.getByTestId("invite-accept-btn").click();
    // Alice is now on the "request sent" waiting screen; her poll runs every 3s.
    await expect(alice.getByTestId("invite-sent")).toBeVisible({ timeout: 30_000 });

    // Bob navigates to /connections/pending and denies the request.
    // Retry the navigate+click to absorb cross-context sync lag before Alice's
    // request lands in Bob's durable incomingRequests list.
    await expect(async () => {
      await bob.goto("/connections/pending");
      await bob.getByTestId("pending-request-row").first().waitFor({ timeout: 5_000 });
      await bob.getByTestId("deny").first().click({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    // Alice's polling detects deniedAt and advances to the "declined" terminal state.
    await expect(alice.getByTestId("invite-declined")).toBeVisible({
      timeout: 30_000,
    });

    // Bob's pending list is now empty (the deny handler removes the request from
    // the durable incomingRequests list in addition to stamping deniedAt).
    await expect(async () => {
      await bob.goto("/connections/pending");
      await expect(bob.getByTestId("pending-empty")).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 15_000 });
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});
