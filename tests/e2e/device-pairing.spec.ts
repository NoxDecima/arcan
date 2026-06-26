import { test, expect } from "@playwright/test";
import { createAccount, getPairingUrl } from "./helpers";

/**
 * E2E: Full device pairing flow.
 *
 * Context A creates an account and navigates to /pair?role=initiator.
 * Context B (fresh, no account) opens the captured pairing URL.
 * B clicks "Already approved — continue" after submitting its pubkey.
 * A approves the pairing request.
 * B lands on home showing the same display name as A.
 * A's Settings → Devices shows 2 device entries.
 */
test("device pairing flow", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  try {
    await pageA.goto("/");
    const { displayName } = await createAccount(pageA, "Pair Test User");

    // Navigate to initiator pairing screen
    await pageA.goto("/pair?role=initiator");
    // The qr-url-text hook is sr-only (the QR shows no visible text), so
    // getPairingUrl waits for it to be attached rather than visible.
    const pairUrl = await getPairingUrl(pageA);

    // Open in a fresh context (responder — no existing account)
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();

    try {
      await pageB.goto(pairUrl);

      // Responder reaches waiting-approval phase (pubkey submitted to pairing CoValue)
      await expect(pageB.getByTestId("pair-resp-waiting")).toBeVisible({ timeout: 15_000 });

      // Initiator's approval prompt appears once the responder's pubkey syncs
      await expect(pageA.getByTestId("pair-approval-prompt")).toBeVisible({ timeout: 15_000 });
      // Initiator approves — this wraps + writes wrappedAccountSecret to the CoValue
      await pageA.getByTestId("approve-device").click();

      // Responder's 2-second poll detects wrappedAccountSecret → auto-moves to claiming → complete
      // Use a generous timeout to account for Jazz sync latency and the 2s poll interval
      await expect(pageB.getByTestId("pair-resp-complete")).toBeVisible({ timeout: 20_000 });
      await pageB.getByRole("button", { name: /continue/i }).click();

      // Responder home screen should show same display name as initiator
      await expect(pageB.getByTestId("sidebar-display-name")).toHaveText(displayName, {
        timeout: 15_000,
      });

      // After pairing, the responder's device self-registers via the migration
      // self-register block. Both A's and B's device lists should show 2 entries
      // (the original device + the newly paired one).
      await pageA.goto("/settings");
      await expect(pageA.getByTestId("devices-card")).toBeVisible({ timeout: 10_000 });
      await expect
        .poll(
          async () =>
            pageA.locator('[data-testid^="device-row-"]').count(),
          { timeout: 15_000 },
        )
        .toBe(2);
    } finally {
      await ctxB.close();
    }
  } finally {
    await ctxA.close();
  }
});
