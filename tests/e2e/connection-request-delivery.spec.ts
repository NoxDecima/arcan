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
    // Use the PLAIN copy/share URL (channel="link") for the negative control:
    // a link-channel request must NOT raise the live pop-up.
    await expect(bob.getByTestId("copy-url-text")).toBeAttached({ timeout: 15_000 });
    const inviteUrl = (await bob.getByTestId("copy-url-text").textContent())!.trim();
    expect(inviteUrl).toContain("/invite#");
    expect(inviteUrl).not.toContain("via=qr");

    await createAccount(alice, "Alice");
    await alice.goto(inviteUrl);
    await expect(alice.getByTestId("invite-inviter-name")).toContainText("Bob", {
      timeout: 15_000,
    });
    await alice.getByTestId("invite-accept-btn").click();
    await expect(alice.getByTestId("invite-sent")).toBeVisible({ timeout: 30_000 });

    // Unit 9-7 §2-I negative control: a LINK-channel request must NOT raise the
    // live QR pop-up (the immediate modal is gated to channel="qr"). Bob is on
    // /contacts/add; give the request time to arrive, then assert no prompt.
    await bob.waitForTimeout(2000);
    await expect(bob.getByTestId("incoming-connection-prompt")).toHaveCount(0);

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

/**
 * Unit 9-7 §2-I (QR live pop-up), driven through the REAL UI. The QR code on
 * /contacts/add encodes a `?via=qr`-marked invite URL (exposed as qr-url-text);
 * a recipient who opens that URL and accepts mints a channel="qr"
 * ConnectionRequest, which the app-wide IncomingConnectionPrompt surfaces as a
 * live modal on the inviter's screen. (A plain copied link → channel="link" →
 * silent on pending, asserted by the negative control above.)
 */
test("qr-channel request raises the live prompt on the inviter's screen", async ({
  browser,
}) => {
  // Hank (inviter): stays on /contacts/add; should get the live pop-up.
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  // Gwen (guest): opens the QR-marked URL and accepts.
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();

  try {
    await createAccount(host, "Hank");
    await host.goto("/contacts/add");
    // The QR-encoded URL carries ?via=qr.
    await expect(host.getByTestId("qr-url-text")).toBeAttached({ timeout: 15_000 });
    const qrUrl = (await host.getByTestId("qr-url-text").textContent())!.trim();
    expect(qrUrl).toContain("via=qr");
    expect(qrUrl).toContain("/invite");

    await createAccount(guest, "Gwen");
    await guest.goto(qrUrl);
    await expect(guest.getByTestId("invite-inviter-name")).toContainText("Hank", {
      timeout: 15_000,
    });
    await guest.getByTestId("invite-accept-btn").click();
    await expect(guest.getByTestId("invite-sent")).toBeVisible({ timeout: 30_000 });

    // Hank is still on /contacts/add — the app-wide IncomingConnectionPrompt
    // must raise the live modal (channel="qr" gate) and name the guest.
    await expect(host.getByTestId("incoming-connection-prompt")).toBeVisible({
      timeout: 30_000,
    });
    await expect(host.getByTestId("incoming-connection-prompt")).toContainText(
      "Gwen",
    );
  } finally {
    await guestCtx.close();
    await hostCtx.close();
  }
});
