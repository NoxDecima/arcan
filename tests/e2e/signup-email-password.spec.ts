import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

test.describe("signup with email + password", () => {
  test("creates an account, lands on home, shows display name in sidebar", async ({ page }) => {
    const { credentials, displayName } = await createAccount(page, "Alice");

    // Sidebar should show displayName
    await expect(page.getByTestId("sidebar-display-name")).toHaveText(displayName);

    // Username should be alice_<id> — sanity check we didn't accidentally
    // submit something else
    expect(credentials.username).toMatch(/^alice_/);
  });
});
