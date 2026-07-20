import { test, expect } from "@playwright/test";
import { createAccount, signIn } from "./helpers";

test.describe("recovery with code", () => {
  test("user can recover using 24-word code and set a new password", async ({ page }) => {
    const { credentials, recoveryCode } = await createAccount(page, "Alice");
    const newPassword = "newpassword-much-longer-123!";

    // Sign out (custom in-DOM modal since 385844c)
    await page.goto("/settings");
    await page.getByTestId("sign-out-btn").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await page.waitForURL(/\/auth\/login/);

    // Go to recovery
    await page.goto("/auth/recovery");
    await page.getByTestId("recovery-code-input").fill(recoveryCode);
    await page.getByTestId("recovery-submit").click();

    // Stage 2: set new password
    await page.getByTestId("recovery-new-password").fill(newPassword);
    await page.getByTestId("recovery-new-password-confirm").fill(newPassword);
    await page.getByTestId("recovery-set-password").click();
    await page.getByTestId("home-main").waitFor({ timeout: 20_000 });

    // Sign out again, sign in with new password (custom in-DOM modal since 385844c)
    await page.goto("/settings");
    await page.getByTestId("sign-out-btn").click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await page.waitForURL(/\/auth\/login/);

    await signIn(page, { ...credentials, password: newPassword });
    await expect(page.getByTestId("sidebar-display-name")).toBeVisible();
  });
});
