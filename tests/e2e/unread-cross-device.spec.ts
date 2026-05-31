import { test, expect } from "@playwright/test";
import { createAccount, signIn } from "./helpers";

/**
 * E2E: Slice 8 unread state syncs across the user's devices.
 *
 * Bob has two browser contexts (= two "devices") signed into the same
 * account. Alice sends messages from a separate account.
 *   1. Both Bob devices show the same unread badge count.
 *   2. Bob opens the conversation on device A → markRead writes to
 *      me.root.lastReadAt (a per-account CoMap synced via Jazz).
 *   3. Device B's badge clears after a reload.
 *
 * This validates that lastReadAt is account-scoped, not device-local.
 */
test("Slice 8 — opening on device A clears badge on device B", async ({ browser }) => {
  test.setTimeout(240_000);

  const ctxA = await browser.newContext();
  const ctxBobA = await browser.newContext();
  const ctxBobB = await browser.newContext();
  const pageAlice = await ctxA.newPage();
  const pageBobA = await ctxBobA.newPage();
  const pageBobB = await ctxBobB.newPage();

  try {
    // ── 1. Accounts ──────────────────────────────────────────────────────────
    await pageAlice.goto("/");
    await createAccount(pageAlice, "Alice");

    await pageBobA.goto("/");
    const { credentials: bobCreds } = await createAccount(pageBobA, "Bob");

    // Sign Bob in on a second "device" (separate browser context).
    await signIn(pageBobB, bobCreds);

    // ── 2. Pair Alice and Bob ───────────────────────────────────────────────
    // Bob's "device A" generates an invite; Alice accepts.
    await pageBobA.goto("/contacts/add");
    await expect(pageBobA.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
    const inviteUrl = (await pageBobA.getByTestId("qr-url-text").textContent())!.trim();

    await pageAlice.goto(inviteUrl);
    await expect(pageAlice.getByTestId("invite-inviter-name")).toContainText("Bob", {
      timeout: 10_000,
    });
    await pageAlice.getByTestId("invite-accept-btn").click();
    await expect(pageAlice.getByTestId("invite-accepted")).toBeVisible({
      timeout: 10_000,
    });
    await expect(pageBobA.getByTestId("add-contact-accepted")).toBeVisible({
      timeout: 15_000,
    });

    // ── 3. Alice starts a chat with Bob and sends 2 messages ────────────────
    await pageAlice.goto("/contacts");
    await expect(pageAlice.getByTestId("contacts-page-list")).toContainText("Bob", {
      timeout: 10_000,
    });
    await pageAlice.getByTestId("contacts-page-row-0").click();
    await pageAlice.getByTestId("start-chat-btn").click();
    await expect(pageAlice.getByTestId("conversation-detail")).toBeVisible({
      timeout: 10_000,
    });

    await pageAlice.getByTestId("composer-input").fill("ping 1");
    await pageAlice.getByTestId("composer-send-btn").click();
    await expect(pageAlice.getByTestId("message-timeline")).toContainText("ping 1", {
      timeout: 5_000,
    });
    await pageAlice.getByTestId("composer-input").fill("ping 2");
    await pageAlice.getByTestId("composer-send-btn").click();
    await expect(pageAlice.getByTestId("message-timeline")).toContainText("ping 2", {
      timeout: 5_000,
    });

    // ── 4. Both Bob devices show badge with 2 ───────────────────────────────
    await pageBobA.goto("/conversations");
    await pageBobB.goto("/conversations");

    await expect(pageBobA.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 30_000,
    });
    await expect(pageBobB.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 30_000,
    });

    await expect(pageBobA.getByTestId("unread-badge-0")).toHaveText("2", {
      timeout: 30_000,
    });
    await expect(pageBobB.getByTestId("unread-badge-0")).toHaveText("2", {
      timeout: 30_000,
    });

    // ── 5. Bob opens the conversation on device A ───────────────────────────
    await pageBobA.getByTestId("conversation-row-0").click();
    await expect(pageBobA.getByTestId("conversation-detail")).toBeVisible({
      timeout: 10_000,
    });
    await expect(pageBobA.getByTestId("message-timeline")).toContainText("ping 2", {
      timeout: 15_000,
    });

    // ── 6. Device B's badge clears (lastReadAt syncs via Jazz) ──────────────
    // Reload device B to force a fresh read of me.root.lastReadAt.
    await pageBobB.reload();
    await expect(pageBobB.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 15_000,
    });
    await expect(pageBobB.getByTestId("unread-badge-0")).toHaveCount(0, {
      timeout: 20_000,
    });
  } finally {
    await ctxA.close();
    await ctxBobA.close();
    await ctxBobB.close();
  }
});
