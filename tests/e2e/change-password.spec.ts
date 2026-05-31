import { test, expect } from "@playwright/test";
import { createAccount, signIn } from "./helpers";

test.describe("change password", () => {
  test("user changes password; old password fails, new works", async ({ page }) => {
    const { credentials } = await createAccount(page, "Alice");
    const newPassword = "anotherlongpassword99!";

    await page.goto("/settings");
    await page.getByTestId("change-password-btn").click();
    await page.getByTestId("change-password-current").fill(credentials.password);
    await page.getByTestId("change-password-new").fill(newPassword);
    await page.getByTestId("change-password-confirm").fill(newPassword);
    await page.getByTestId("change-password-submit").click();

    // Modal shows "Password changed" then close
    await page.getByText("Password changed").waitFor();

    // Sign out
    await page.goto("/settings");
    page.on("dialog", d => d.accept());
    await page.getByTestId("sign-out-btn").click();
    await page.waitForURL(/\/auth\/login/);

    // Old password fails
    await page.getByTestId("login-email").fill(credentials.email);
    await page.getByTestId("login-password").fill(credentials.password);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toBeVisible();

    // New password works
    await signIn(page, { ...credentials, password: newPassword });
    await expect(page.getByTestId("sidebar-display-name")).toBeVisible();
  });
});
