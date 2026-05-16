import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

/**
 * E2E: Contact invitation flow (two accounts, mutual contact).
 *
 * Alice (ctxA) and Bob (ctxB) each create accounts.
 * Bob navigates to /contacts/add and captures the invite URL.
 * Alice opens the URL, sees Bob as the inviter, and accepts.
 * Both contact lists eventually show the other person.
 *
 * Note: polling-based cross-context sync can take several seconds;
 * generous timeouts (10-15s) are used on both sides.
 */
test("contact invitation flow", async ({ browser }) => {
  // Alice
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  // Bob
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();

  try {
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    // Bob navigates to /contacts/add to generate an invite link
    await pageB.goto("/contacts/add");
    await expect(pageB.getByTestId("qr-display")).toBeVisible({ timeout: 10_000 });
    // The QRDisplay is rendered with showText=true; wait for the text element
    await expect(pageB.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await pageB.getByTestId("qr-url-text").textContent())!.trim();

    // Alice opens the invite link
    await pageA.goto(inviteUrl);
    // Invite accept screen should show Bob as inviter
    await expect(pageA.getByTestId("invite-inviter-name")).toContainText("Bob", {
      timeout: 10_000,
    });
    await pageA.getByTestId("invite-accept-btn").click();

    // Alice lands on accepted screen
    await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 10_000 });

    // Alice navigates home — her contact list should contain Bob
    await pageA.goto("/");
    await expect(pageA.getByTestId("contact-list")).toContainText("Bob", {
      timeout: 10_000,
    });

    // Bob's side: polling detects acceptance and completes → navigate home
    // Bob may still be on /contacts/add showing "Contact added!" or the page may have navigated.
    // Either way: navigate home explicitly and check contact list.
    await expect(pageB.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });
    await pageB.getByRole("button", { name: /go home/i }).click();
    await expect(pageB.getByTestId("contact-list")).toContainText("Alice", {
      timeout: 10_000,
    });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
