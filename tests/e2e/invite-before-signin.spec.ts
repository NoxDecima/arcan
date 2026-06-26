import { test, expect } from "@playwright/test";
import { createAccount, fillOnboardingForm } from "./helpers";

/**
 * E2E: Invite link received before sign-in triggers onboarding, then replays.
 *
 * Bob creates an account and an invite link.
 * A fresh context (no account) navigates to the invite URL.
 * The InviteRoute detects no auth, stashes the fragment in sessionStorage,
 * and redirects to "/" — which, since Slice 7, lands on /auth/login.
 * From the login page Alice clicks "Create new account" and completes
 * onboarding. The profile-step / signUp flow detects the stashed fragment,
 * replays via window.location.assign, and Alice lands on the invite accept
 * screen showing Bob as the inviter.
 *
 * Note: window.location.assign() triggers a full page reload; Playwright handles
 * this transparently. Use generous timeouts (20s) for Jazz sync after sign-in.
 */
test("invite link opens onboarding then replays after sign-in", async ({ browser }) => {
  // Bob creates account + invite link
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  // Fresh context (Alice — no account yet)
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  try {
    await createAccount(pageB, "Bob");

    await pageB.goto("/contacts/add");
    // qr-url-text is sr-only — wait for it to be attached, not visible.
    await pageB.getByTestId("qr-url-text").waitFor({ state: "attached", timeout: 10_000 });
    const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();

    // Alice (unauthenticated) opens the invite URL. The InviteRoute shows a
    // sign-in gate (Unit 9-7) and stashes the fragment in sessionStorage for
    // post-auth replay.
    await pageA.goto(inviteUrl);
    await expect(pageA.getByTestId("invite-signin-required")).toBeVisible({
      timeout: 10_000,
    });

    // Complete account creation as Alice.
    // Use fillOnboardingForm (not createAccount) because profile-step / signUp
    // will call window.location.assign("/invite#...") immediately after the
    // signup completes, navigating away before home-main ever appears. We
    // assert on the invite screen instead of home-main.
    await fillOnboardingForm(pageA, "Alice");

    // After sign-in, profile-step replays the stashed invite URL via
    // location.assign. Alice should land on the invite accept screen
    // showing Bob as inviter.
    await expect(pageA.getByTestId("invite-inviter-name")).toContainText("Bob", {
      timeout: 20_000,
    });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
