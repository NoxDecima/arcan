import { test, expect } from "@playwright/test";
import { createAccount, fillOnboardingForm } from "./helpers";

/**
 * E2E: Invite link received before sign-in triggers onboarding, then replays.
 *
 * Bob creates an account and an invite link.
 * A fresh context (no account) navigates to the invite URL.
 * The InviteRoute detects no auth, stashes the fragment in sessionStorage,
 * and redirects to the welcome screen.
 * The fresh context completes account creation as "Alice".
 * The ProfileStep detects the stashed fragment, replays via window.location.assign,
 * and Alice lands on the invite accept screen showing Bob as the inviter.
 *
 * Note: window.location.assign() triggers a full page reload; Playwright handles
 * this transparently. Use generous timeouts (15s) for Jazz sync after sign-in.
 */
test("invite link opens onboarding then replays after sign-in", async ({ browser }) => {
  // Bob creates account + invite link
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  // Fresh context (Alice — no account yet)
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  try {
    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    await pageB.goto("/contacts/add");
    await expect(pageB.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();

    // Alice (unauthenticated) opens the invite URL
    await pageA.goto(inviteUrl);

    // Should redirect to welcome (onboarding) screen
    await expect(
      pageA.getByRole("heading", { name: /Welcome to Jazz Messanger/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Complete account creation as Alice.
    // Use fillOnboardingForm (not createAccount) because ProfileStep will call
    // window.location.assign("/invite#...") immediately after registerNewAccount,
    // navigating away before home-main ever appears. We assert on the invite
    // screen instead of home-main.
    await fillOnboardingForm(pageA, "Alice");

    // After sign-in, ProfileStep replays the stashed invite URL via location.assign.
    // Alice should land on the invite accept screen showing Bob as inviter.
    await expect(pageA.getByTestId("invite-inviter-name")).toContainText("Bob", {
      timeout: 15_000,
    });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
