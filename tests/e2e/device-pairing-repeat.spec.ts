import { test, expect } from "@playwright/test";
import { createAccount, getPairingUrl } from "./helpers";

/**
 * E2E: Two back-to-back pairings from the same initiator.
 *
 * This test validates the core fix from round 3: switching from secretSeed to
 * accountSecret transfer so that a second pairing from the same session works.
 *
 * Context A creates an account and does two sequential pairings:
 *   1. A pairs B (second device)
 *   2. A pairs C (third device) — this was the failing scenario before the fix
 *
 * Both B and C should land on home showing the same display name as A.
 * A's Settings → Devices should show 3 entries (the original device + the two
 * paired devices that self-register via the migration on first startup).
 */
test("pair two devices back-to-back from same initiator", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  try {
    await pageA.goto("/");
    const { displayName } = await createAccount(pageA, "Repeat Pair User");

    // ---- Pairing #1: A → B ----
    await pageA.goto("/pair?role=initiator");
    // qr-url-text is sr-only; getPairingUrl waits for it to be attached.
    const pairUrl1 = await getPairingUrl(pageA);

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();

    try {
      await pageB.goto(pairUrl1);

      // Responder B reaches waiting-approval phase
      await expect(pageB.getByTestId("pair-resp-waiting")).toBeVisible({ timeout: 15_000 });

      // Initiator A approves
      await expect(pageA.getByTestId("pair-approval-prompt")).toBeVisible({ timeout: 15_000 });
      await pageA.getByTestId("approve-device").click();

      // B claims the account
      await expect(pageB.getByTestId("pair-resp-complete")).toBeVisible({ timeout: 20_000 });
      await pageB.getByRole("button", { name: /continue/i }).click();

      // B home shows same display name
      await expect(pageB.getByTestId("sidebar-display-name")).toHaveText(displayName, {
        timeout: 15_000,
      });

      // A is now on the complete phase. pair-init-complete is an empty 0-size
      // marker div (not "visible"); assert the home button instead, then click.
      await expect(pageA.getByTestId("pair-init-home-btn")).toBeVisible({ timeout: 15_000 });
      await pageA.getByTestId("pair-init-home-btn").click();
      await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });

      // ---- Pairing #2: A → C (the previously-failing scenario) ----
      await pageA.goto("/pair?role=initiator");
      const pairUrl2 = await getPairingUrl(pageA);

      const ctxC = await browser.newContext();
      const pageC = await ctxC.newPage();

      try {
        await pageC.goto(pairUrl2);

        // Responder C reaches waiting-approval phase
        await expect(pageC.getByTestId("pair-resp-waiting")).toBeVisible({ timeout: 15_000 });

        // Initiator A approves second pairing
        await expect(pageA.getByTestId("pair-approval-prompt")).toBeVisible({ timeout: 15_000 });
        await pageA.getByTestId("approve-device").click();

        // C claims the account
        await expect(pageC.getByTestId("pair-resp-complete")).toBeVisible({ timeout: 20_000 });
        await pageC.getByRole("button", { name: /continue/i }).click();

        // C home shows same display name — this is the key assertion
        await expect(pageC.getByTestId("sidebar-display-name")).toHaveText(displayName, {
          timeout: 15_000,
        });

        // Verify A's Settings → Devices shows all 3 devices.
        // Each responder self-registers on first migration after authenticate;
        // sync propagates the new DeviceRecord back to A within seconds.
        await pageA.goto("/settings");
        await expect(pageA.getByTestId("devices-card")).toBeVisible({ timeout: 10_000 });
        await expect
          .poll(
            async () =>
              pageA.locator('[data-testid^="device-row-"]').count(),
            { timeout: 15_000 },
          )
          .toBe(3);
      } finally {
        await ctxC.close();
      }
    } finally {
      await ctxB.close();
    }
  } finally {
    await ctxA.close();
  }
});
