import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * E2E: Archive after admin-kick (Slice 4)
 *
 * Alice creates a 3-member group (with Bob and Charlie). Alice removes Charlie
 * from the Members route. Charlie's sidebar should show the conversation in the
 * "Archived" section and the timeline should contain a "removed" system event.
 */

async function pairWith(
  browser: import("@playwright/test").Browser,
  pageA: Page,
  name: string,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  await createAccount(page, name);

  await page.goto("/contacts/add");
  await expect(page.getByTestId("qr-url-text")).toBeVisible({ timeout: 10_000 });
  const inviteUrl = (await page.getByTestId("qr-url-text").textContent())!.trim();

  // Navigate Alice to a neutral page first to avoid InviteRoute phase collision
  await pageA.goto("/conversations");
  await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
  await pageA.goto(inviteUrl);
  await expect(pageA.getByTestId("invite-inviter-name")).toContainText(name, {
    timeout: 15_000,
  });
  await pageA.getByTestId("invite-accept-btn").click();
  await expect(pageA.getByTestId("invite-accepted")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("add-contact-accepted")).toBeVisible({ timeout: 15_000 });

  return { ctx, page };
}

test("admin-kicks-member lands conversation in kicked member's archive (Slice 4)", async ({
  browser,
}) => {
  test.setTimeout(300_000);

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  let ctxBob: BrowserContext | null = null;
  let ctxCharlie: BrowserContext | null = null;

  try {
    // ── 1. Create Alice ─────────────────────────────────────────────────────
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    // ── 2. Pair Alice with Bob, then with Charlie ────────────────────────────
    const { ctx: _ctxBob, page: pageBob } = await pairWith(browser, pageA, "Bob");
    ctxBob = _ctxBob;

    const { ctx: _ctxCharlie, page: pageCharlie } = await pairWith(
      browser,
      pageA,
      "Charlie",
    );
    ctxCharlie = _ctxCharlie;

    // ── 3. Alice creates a group with Bob and Charlie ────────────────────────
    await pageA.goto("/conversations");
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });

    await pageA.getByTestId("new-chat-btn").click();
    await expect(pageA.getByTestId("contact-picker-overlay")).toBeVisible({
      timeout: 5_000,
    });

    // Select both Bob and Charlie
    await pageA.getByTestId("contact-picker-row-0").click();
    await pageA.getByTestId("contact-picker-row-1").click();
    await pageA.getByTestId("contact-picker-continue").click();

    // GroupCreateDialog: set title and submit
    await expect(pageA.getByTestId("group-create-overlay")).toBeVisible({ timeout: 5_000 });
    await pageA.getByTestId("group-create-title-input").fill("Trip planning");
    await pageA.getByTestId("group-create-submit").click();

    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 15_000 });

    // ── 4. Alice sends a message ─────────────────────────────────────────────
    await pageA.getByTestId("composer-input").fill("Hi everyone");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText("Hi everyone", {
      timeout: 5_000,
    });

    // ── 5. Charlie discovers the group ───────────────────────────────────────
    await pageCharlie.goto("/conversations");
    await expect(pageCharlie.getByTestId("conversation-row-0")).toBeVisible({
      timeout: 30_000,
    });
    await pageCharlie.getByTestId("conversation-row-0").click();
    await expect(pageCharlie.getByTestId("message-timeline")).toContainText("Hi everyone", {
      timeout: 20_000,
    });

    // ── 6. Alice opens Members route and removes Charlie ────────────────────
    await pageA.getByTestId("members-link").click();
    await expect(pageA.getByTestId("members-route")).toBeVisible({ timeout: 5_000 });

    // Get Charlie's member row to find the remove button
    const charlieRow = pageA.locator('[data-testid^="member-row-"]').filter({ hasText: "Charlie" });
    await expect(charlieRow).toBeVisible({ timeout: 10_000 });
    const charlieTestId = await charlieRow.getAttribute("data-testid");
    expect(charlieTestId).toBeTruthy();
    const charlieID = charlieTestId!.replace("member-row-", "");

    pageA.once("dialog", (dialog) => dialog.accept());
    await pageA.getByTestId(`remove-${charlieID}`).click();

    // Verify Charlie's row is gone from Alice's view
    await expect(pageA.getByTestId(`member-row-${charlieID}`)).not.toBeVisible({
      timeout: 10_000,
    });

    // ── 7. Charlie's sidebar: conversation is now in Archived section ────────
    // Charlie is still on the conversation detail; navigate to conversations list
    await pageCharlie.goto("/conversations");
    await expect(pageCharlie.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });

    // Active list: conversation should NOT be in active rows
    await expect(pageCharlie.getByTestId("conversation-row-0")).not.toBeVisible({
      timeout: 15_000,
    });

    // Archived section header appears
    const archivedHeader = pageCharlie.getByTestId("archived-section-header");
    await expect(archivedHeader).toBeVisible({ timeout: 15_000 });
    await expect(archivedHeader).toHaveText(/Archived \(1\)/);

    // Expand the section
    await archivedHeader.click();
    await expect(pageCharlie.getByTestId("archived-row-0")).toBeVisible();

    // ── 8. Charlie opens the archived conversation (read-only view) ─────────
    await pageCharlie.getByTestId("archived-row-0").locator("a").click();
    await expect(pageCharlie.getByTestId("archived-banner")).toBeVisible({ timeout: 5_000 });
    // Charlie's conversation is inaccessible after revocation (NotLoaded proxy),
    // so she cannot read the system event content. The banner confirms she's
    // in the archive view. The system-event-removed pill is visible to remaining
    // members (Alice and Bob) who still have group access.

    // ── 9. Alice still sees the "removed" system event in the timeline ────────
    // Navigate Alice back to the conversation
    await pageA.getByTestId("back-btn").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 5_000 });
    await expect(pageA.getByTestId("system-event-removed")).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    await ctxA.close();
    if (ctxBob) await ctxBob.close();
    if (ctxCharlie) await ctxCharlie.close();
  }
});
