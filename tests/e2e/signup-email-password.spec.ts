import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

test.describe("signup with email + password", () => {
  test("creates an account, lands on home, shows display name in sidebar", async ({ page }) => {
    const { credentials, displayName } = await createAccount(page, "Alice");

    // Sidebar should show displayName
    await expect(page.getByTestId("sidebar-display-name")).toHaveText(displayName);

    // Email is alice-<id>@example.com — sanity check the helper used a fresh fixture
    expect(credentials.email).toMatch(/^alice-/);
  });
});
