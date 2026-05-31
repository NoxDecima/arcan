import { test, expect } from "@playwright/test";
import { createAccount, signIn } from "./helpers";

test.describe("sign-in after logout", () => {
  test("user can sign back in with email + password", async ({ page }) => {
    const { credentials } = await createAccount(page, "Alice");

    // Sign out
    await page.goto("/settings");
    page.on("dialog", d => d.accept());
    await page.getByTestId("sign-out-btn").click();
    await page.waitForURL(/\/auth\/login/);

    // Sign back in
    await signIn(page, credentials);

    await expect(page.getByTestId("sidebar-display-name")).toBeVisible();
  });
});
