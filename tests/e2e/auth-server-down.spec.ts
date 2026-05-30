import { test, expect } from "@playwright/test";
import { freshCredentials } from "./helpers";

test.describe("auth-server unreachable", () => {
  test("signup shows network error when /api/auth returns 502", async ({ page }) => {
    // Intercept all /api/auth/* requests and fail them
    await page.route("**/api/auth/**", (route) => {
      route.fulfill({ status: 502, body: "{}" });
    });

    const creds = freshCredentials("offline");
    await page.goto("/onboarding");
    await page.getByTestId("create-account-btn").click();
    await page.getByTestId("credentials-email").fill(creds.email);
    await page.getByTestId("credentials-username").fill(creds.username);
    await page.getByTestId("credentials-password").fill(creds.password);
    await page.getByTestId("credentials-confirm").fill(creds.password);
    await page.getByTestId("credentials-continue").click();
    // Backup-display: capture the 24 words BEFORE clicking continue, since
    // the grid unmounts on the next step.
    const words: string[] = [];
    const wordDivs = page.locator('[data-testid="passphrase-grid"] > div');
    const count = await wordDivs.count();
    for (let i = 0; i < count; i++) {
      words.push((await wordDivs.nth(i).locator("span").nth(1).textContent()) ?? "");
    }
    await page.getByTestId("passphrase-saved-checkbox").check();
    await page.getByTestId("passphrase-display-continue").click();
    // Backup-confirm: fill the 3 challenge words by reading each label.
    for (let slot = 0; slot < 3; slot++) {
      const label = page.locator(`label[for="confirm-word-${slot}"]`);
      const labelText = (await label.textContent()) ?? "";
      const m = labelText.match(/Word\s+(\d+)/)!;
      await page.getByTestId(`confirm-word-${slot}`).fill(words[parseInt(m[1], 10) - 1]);
    }
    await page.getByTestId("confirm-passphrase-btn").click();
    await page.getByTestId("display-name-input").fill("Offline Alice");
    await page.getByTestId("finish-onboarding-btn").click();

    // After Finish click, signUp's fetch fails with 502 → flows.ts throws
    // and rolls back the Jazz account via authSecretStorage.clear(). That
    // flips useIsAuthenticated() to false; App re-renders and the user is
    // redirected from /onboarding to /auth/login (the unauthenticated
    // catch-all). So we should NOT reach home-main, and we SHOULD end up
    // back on the login screen.
    await page.waitForURL(/\/auth\/login/, { timeout: 10_000 });
    await expect(page.getByTestId("home-main")).toBeHidden();
  });
});
