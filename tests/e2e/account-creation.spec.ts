import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * E2E: Full account creation flow.
 *
 * Walks the onboarding path via the shared createAccount() helper:
 *   welcome → credentials → backup-display → backup-confirm → profile → home
 *
 * The helper is the single source of truth for onboarding selectors (see
 * tests/e2e/helpers.ts). This spec asserts the end-to-end outcome: a 24-word
 * recovery code was shown and the new account's display name lands in the
 * sidebar.
 */
test("account creation flow", async ({ page }) => {
  const { recoveryCode, displayName } = await createAccount(page, "Test User");

  // The helper already waited for home-main. Verify the captured recovery
  // code is a full 24-word mnemonic.
  expect(recoveryCode.split(" ")).toHaveLength(24);
  for (const word of recoveryCode.split(" ")) {
    expect(word.trim().length).toBeGreaterThan(0);
  }

  // Sidebar shows the chosen display name. The app mounts both the shared
  // app-shell Sidebar and the mobile (md:hidden) Sidebar, so the testid
  // resolves to two nodes — assert against the first (the visible desktop one).
  await expect(page.getByTestId("home-main")).toBeVisible();
  await expect(page.getByTestId("sidebar-display-name").first()).toHaveText(
    displayName,
  );
});
