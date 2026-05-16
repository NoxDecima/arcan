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
    // Wait for the QR to render (the text element appears once pairing invite is created)
    await expect(pageA.getByTestId("qr-url-text")).toBeVisible({ timeout: 15_000 });
    const pairUrl = await getPairingUrl(pageA);

    // Open in a fresh context (responder — no existing account)
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();

    try {
      await pageB.goto(pairUrl);

      // Responder reaches waiting-approval phase; click "Already approved — continue"
      await expect(pageB.getByTestId("pair-resp-continue")).toBeVisible({ timeout: 15_000 });
      await pageB.getByTestId("pair-resp-continue").click();

      // Initiator's approval prompt appears
      await expect(pageA.getByTestId("pair-approval-prompt")).toBeVisible({ timeout: 15_000 });
      await pageA.getByTestId("pair-approve-btn").click();

      // Responder lands on complete screen then navigates home
      await expect(pageB.getByTestId("pair-resp-complete")).toBeVisible({ timeout: 15_000 });
      await pageB.getByRole("button", { name: /continue/i }).click();

      // Responder home screen should show same display name as initiator
      await expect(pageB.getByTestId("sidebar-display-name")).toHaveText(displayName, {
        timeout: 15_000,
      });

      // Initiator: Settings → Devices should show 2 device entries
      await pageA.goto("/settings");
      const deviceItems = pageA.getByTestId("device-list").locator("li");
      await expect(deviceItems).toHaveCount(2, { timeout: 15_000 });
    } finally {
      await ctxB.close();
    }
  } finally {
    await ctxA.close();
  }
});
