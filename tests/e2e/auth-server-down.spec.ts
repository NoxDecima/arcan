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
    // Backup-confirm: fill the 3 challenge words. The label has no `for`
    // attribute; the prompt lives in a sibling <span> ("word #NN", zero-padded).
    for (let slot = 0; slot < 3; slot++) {
      const input = page.getByTestId(`confirm-word-${slot}`);
      await input.waitFor({ timeout: 20_000 });
      const labelText = (await input.locator("xpath=../span").first().textContent()) ?? "";
      const m = labelText.match(/#?\s*0*(\d+)/)!;
      await input.fill(words[parseInt(m[1], 10) - 1]);
    }
    await page.getByTestId("confirm-passphrase-btn").click();
    await page.getByTestId("display-name-input").fill("Offline Alice");
    await page.getByTestId("finish-onboarding-btn").click();

    // After Finish click, signUp's fetch fails with 502. Per the Slice 7
    // pre-push silent-error fix (commit 798b2e4: defer persistAuthMaterial
    // until POST succeeds), flows.ts throws BEFORE writing credentials to
    // AuthSecretStorage — so useIsAuthenticated() never flips to true, the
    // OnboardingRoute stays mounted, and ProfileStep's catch handler
    // renders the error in `profile-error`. The user stays on the form;
    // they do NOT get bounced back to /auth/login.
    await expect(page.getByTestId("profile-error")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByTestId("home-main")).toBeHidden();
  });
});
