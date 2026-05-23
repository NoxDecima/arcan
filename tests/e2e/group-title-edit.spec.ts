import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * E2E: Inline group title edit on MembersRoute
 *
 * Alice creates a group with Bob (title "Old name"). Alice opens /members and
 * clicks the title to enter edit mode, types "New name", saves. Bob's sidebar
 * eventually shows "New name".
 *
 * Writer read-only: Bob (writer) opens /members — the title is displayed but
 * clicking it does NOT enter edit mode (no `group-title-edit-input` appears).
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

  // Navigate Alice to neutral page to avoid InviteRoute phase collision
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

test("inline group title edit — admin can edit, writer sees read-only", async ({
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

    // ── 2. Pair Alice with Bob and a second contact (need 2 for group) ───────
    const { ctx: _ctxBob, page: pageBob } = await pairWith(browser, pageA, "Bob");
    ctxBob = _ctxBob;

    // Need a second contact to create a true group (3+ members)
    const { ctx: _ctxCharlie } = await pairWith(browser, pageA, "Charlie");
    ctxCharlie = _ctxCharlie;

    // ── 3. Alice creates a group titled "Old name" ────────────────────────────
    await pageA.goto("/conversations");
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });
    await pageA.getByTestId("new-chat-btn").click();
    await expect(pageA.getByTestId("contact-picker-overlay")).toBeVisible({ timeout: 5_000 });

    // Select both contacts to create a group
    await pageA.getByTestId("contact-picker-row-0").click();
    await pageA.getByTestId("contact-picker-row-1").click();
    await pageA.getByTestId("contact-picker-continue").click();

    await expect(pageA.getByTestId("group-create-overlay")).toBeVisible({ timeout: 5_000 });
    await pageA.getByTestId("group-create-title-input").fill("Old name");
    await pageA.getByTestId("group-create-submit").click();

    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 15_000 });

    // ── 4. Alice opens /members — title shows in display mode ────────────────
    await pageA.getByTestId("members-link").click();
    await expect(pageA.getByTestId("members-route")).toBeVisible({ timeout: 5_000 });

    await expect(pageA.getByTestId("group-title-display")).toBeVisible({ timeout: 5_000 });
    await expect(pageA.getByTestId("group-title-display")).toContainText("Old name");

    // Edit mode is NOT active by default
    await expect(pageA.getByTestId("group-title-edit-input")).not.toBeVisible();

    // ── 5. Alice clicks the title — enters edit mode ──────────────────────────
    await pageA.getByTestId("group-title-display").click();

    await expect(pageA.getByTestId("group-title-edit-input")).toBeVisible({ timeout: 3_000 });
    await expect(pageA.getByTestId("group-title-save-btn")).toBeVisible();
    await expect(pageA.getByTestId("group-title-cancel-btn")).toBeVisible();

    // ── 6. Alice clears the input and types "New name", then saves ────────────
    await pageA.getByTestId("group-title-edit-input").fill("New name");
    await pageA.getByTestId("group-title-save-btn").click();

    // Edit mode closes; display shows "New name"
    await expect(pageA.getByTestId("group-title-edit-input")).not.toBeVisible({ timeout: 5_000 });
    await expect(pageA.getByTestId("group-title-display")).toContainText("New name", {
      timeout: 5_000,
    });

    // ── 7. Bob's sidebar shows "New name" ────────────────────────────────────
    await pageBob.goto("/conversations");
    await expect(pageBob.getByTestId("conversation-row-0")).toBeVisible({ timeout: 30_000 });
    await expect(pageBob.getByTestId("conversation-row-0")).toContainText("New name", {
      timeout: 20_000,
    });

    // ── 8. Alice also tests the Escape key cancels edit ───────────────────────
    await pageA.getByTestId("group-title-display").click();
    await expect(pageA.getByTestId("group-title-edit-input")).toBeVisible({ timeout: 3_000 });
    await pageA.getByTestId("group-title-edit-input").fill("Should not save");
    await pageA.getByTestId("group-title-edit-input").press("Escape");
    await expect(pageA.getByTestId("group-title-edit-input")).not.toBeVisible({ timeout: 3_000 });
    // Title should still be "New name" (Esc cancelled the edit)
    await expect(pageA.getByTestId("group-title-display")).toContainText("New name");

    // ── 9. Bob (writer) opens /members — title displays but is not editable ───
    const membersUrl = pageA.url();
    await pageBob.goto(membersUrl);
    await expect(pageBob.getByTestId("members-route")).toBeVisible({ timeout: 10_000 });

    // Bob sees the title in display mode
    await expect(pageBob.getByTestId("group-title-display")).toBeVisible({ timeout: 5_000 });
    await expect(pageBob.getByTestId("group-title-display")).toContainText("New name");

    // Bob clicks the title — edit mode should NOT activate
    await pageBob.getByTestId("group-title-display").click();
    // After a short wait, the edit input should still not appear
    await expect(pageBob.getByTestId("group-title-edit-input")).not.toBeVisible({
      timeout: 3_000,
    });
  } finally {
    await ctxA.close();
    if (ctxBob) await ctxBob.close();
    if (ctxCharlie) await ctxCharlie.close();
  }
});
