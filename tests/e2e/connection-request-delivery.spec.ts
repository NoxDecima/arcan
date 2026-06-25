import { test, expect, type Page } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * Decode the inviterAccountID from an /invite URL fragment.
 * Fragment format: base64url("invitationID|inviterAccountID").
 */
function inviterAccountIDFromInviteUrl(url: string): string {
  const fragment = new URL(url).hash.slice(1);
  const padded = fragment
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(fragment.length + ((4 - (fragment.length % 4)) % 4), "=");
  const decoded = Buffer.from(padded, "base64").toString("utf8");
  const parts = decoded.split("|");
  if (parts.length !== 2) {
    throw new Error(`Unexpected invite fragment: "${decoded}"`);
  }
  return parts[1];
}

/** Arm the Unit 9-7 test-only QR-request bridge before any app code runs. */
async function armQrBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __ARCAN_E2E__?: boolean }).__ARCAN_E2E__ = true;
  });
}

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
 * Unit 9-7 §2-I (QR live pop-up). The plan originally proposed driving this via
 * /pair?role=initiator, but that route is the multi-device *account-pairing*
 * flow — it mints no contact ConnectionRequest and exposes no qr-url-text. No
 * production UI mints a channel="qr" *contact* invitation today (createInvitation
 * is only ever called with "link"). To keep the binding assertion real — a
 * channel="qr" request makes incoming-connection-prompt visible on the host —
 * without faking the prompt or inventing product scope, we exercise the genuine
 * pipeline via the test-only window.__arcanCreateQrRequest bridge (App.tsx,
 * gated behind window.__ARCAN_E2E__): real createConnectionRequest("qr") → real
 * Inbox delivery → durable me.root.incomingRequests → the real app-mounted
 * IncomingConnectionPrompt. The host sits on a normal app screen while it fires.
 */
test("qr-channel request raises the live prompt on the recipient's screen", async ({
  browser,
}) => {
  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();

  try {
    await armQrBridge(guest);

    await createAccount(host, "Hank");
    await createAccount(guest, "Gwen");

    // Read the host's accountID from its /contacts/add invite fragment.
    await host.goto("/contacts/add");
    await expect(host.getByTestId("qr-url-text")).toBeVisible({ timeout: 15_000 });
    const inviteUrl = (await host.getByTestId("qr-url-text").textContent())!.trim();
    expect(inviteUrl).toContain("/invite#");
    const hostAccountID = inviterAccountIDFromInviteUrl(inviteUrl);
    expect(hostAccountID).toContain("co_z");

    // Guest mints a REAL channel="qr" ConnectionRequest to the host via the
    // production createConnectionRequest helper (through the test bridge).
    const reqId = await guest.evaluate(
      (recipientID) =>
        (
          window as unknown as {
            __arcanCreateQrRequest: (id: string) => Promise<string>;
          }
        ).__arcanCreateQrRequest(recipientID),
      hostAccountID,
    );
    expect(reqId).toContain("co_z");

    // Host is on a normal app screen — the app-wide IncomingConnectionPrompt
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
