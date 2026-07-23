import { test, expect } from "@playwright/test";
import { createAccount, establishContact } from "./helpers";

/**
 * E2E: Contact invitation flow (two accounts, mutual contact).
 *
 * Alice (ctxA) and Bob (ctxB) each create accounts.
 * Bob generates an invite link; Alice opens it and connects; Bob approves
 * the request (the Unit 9-7 asymmetric request/approve handshake).
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

    // Bob invites, Alice connects, Bob approves → mutual contact.
    await establishContact(pageB, pageA, "Bob");

    // Alice's contacts tab should contain Bob.
    await pageA.goto("/?tab=contacts");
    await expect(pageA.getByTestId("sidebar-contacts-list")).toContainText("Bob", {
      timeout: 10_000,
    });

    // Bob's contacts tab should contain Alice.
    await pageB.goto("/?tab=contacts");
    await expect(pageB.getByTestId("sidebar-contacts-list")).toContainText("Alice", {
      timeout: 10_000,
    });

    // #59: no 1:1 conversation exists yet, so Bob's profile CTA offers to
    // create one. (The flipped "open conversation" label is asserted in
    // attachment-image.spec.ts, where a 1:1 exists.)
    await pageA
      .getByTestId("sidebar-contacts-list")
      .getByText("Bob", { exact: false })
      .first()
      .click();
    await expect(pageA.getByTestId("profile-message")).toContainText(
      "create conversation",
      { timeout: 10_000 },
    );
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
