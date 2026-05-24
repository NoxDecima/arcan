import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * E2E: System events render at the correct chronological position (Slice 4)
 *
 * Alice creates a 2-person group with Bob, sends "First message", then adds
 * Charlie (writing an "added" system event), then sends "Second message".
 *
 * The timeline on Alice's screen should contain items in this order:
 *   "First message" → "Alice added Charlie" pill → "Second message"
 *
 * This verifies that system events are interleaved by occurredAt, not appended
 * after all messages.
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

test("'added' system event renders at the correct chronological position in the timeline (Slice 4)", async ({
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

    // ── 2. Pair Alice with Bob and Charlie ───────────────────────────────────
    const { ctx: _ctxBob, page: pageBob } = await pairWith(browser, pageA, "Bob");
    ctxBob = _ctxBob;

    const { ctx: _ctxCharlie } = await pairWith(browser, pageA, "Charlie");
    ctxCharlie = _ctxCharlie;

    // ── 3. Alice creates a 2-person group with Bob only ──────────────────────
    await pageA.goto("/conversations");
    await expect(pageA.getByTestId("home-main")).toBeVisible({ timeout: 10_000 });

    await pageA.getByTestId("new-chat-btn").click();
    await expect(pageA.getByTestId("contact-picker-overlay")).toBeVisible({ timeout: 5_000 });

    // Find and select only Bob from the picker
    const row0Text = await pageA.getByTestId("contact-picker-row-0").textContent();
    const bobIsRow0 = row0Text?.toLowerCase().includes("bob");
    if (bobIsRow0) {
      await pageA.getByTestId("contact-picker-row-0").click();
    } else {
      await pageA.getByTestId("contact-picker-row-1").click();
    }
    await pageA.getByTestId("contact-picker-continue").click();

    // GroupCreateDialog appears (multi-select triggers it even for 1 contact)
    // If it's a DM (1 contact), it goes directly to conversation; if dialog appears, set title
    const isGroupDialog = await pageA
      .getByTestId("group-create-overlay")
      .isVisible()
      .catch(() => false);

    if (isGroupDialog) {
      await pageA.getByTestId("group-create-title-input").fill("Plans");
      await pageA.getByTestId("group-create-submit").click();
    }

    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 15_000 });

    // ── 4. Alice sends "First message" ──────────────────────────────────────
    await pageA.getByTestId("composer-input").fill("First message");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText("First message", {
      timeout: 5_000,
    });

    // Confirm Bob sees the first message (cross-context sync)
    await pageBob.goto("/conversations");
    await expect(pageBob.getByTestId("conversation-row-0")).toBeVisible({ timeout: 30_000 });
    await pageBob.getByTestId("conversation-row-0").click();
    await expect(pageBob.getByTestId("message-timeline")).toContainText("First message", {
      timeout: 20_000,
    });

    // ── 5. Alice navigates to Members and adds Charlie ───────────────────────
    await pageA.getByTestId("members-link").click();
    await expect(pageA.getByTestId("members-route")).toBeVisible({ timeout: 5_000 });
    await pageA.getByTestId("add-member-btn").click();
    await expect(pageA.getByTestId("contact-picker-overlay")).toBeVisible({ timeout: 5_000 });

    // Only Charlie should be available (Bob already a member)
    await pageA.getByTestId("contact-picker-row-0").click();
    await pageA.getByTestId("contact-picker-continue").click();

    // Wait for Charlie to appear in members list
    await expect(pageA.getByTestId("members-route")).toContainText("Charlie", {
      timeout: 15_000,
    });

    // ── 6. Alice navigates back and sends "Second message" ───────────────────
    await pageA.getByTestId("back-btn").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 5_000 });

    // Small wait to ensure the system event's occurredAt is strictly after first message
    await pageA.waitForTimeout(200);

    await pageA.getByTestId("composer-input").fill("Second message");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText("Second message", {
      timeout: 5_000,
    });

    // Also wait for the system-event-added pill to appear
    await expect(pageA.getByTestId("system-event-added")).toBeVisible({ timeout: 5_000 });

    // ── 7. Assert chronological order in the timeline ────────────────────────
    // We use the DOM order of items in the timeline:
    //   message-mine/message-other items and system-event-added
    const timeline = pageA.getByTestId("message-timeline");

    // Collect all timeline items: messages (mine or other) + system events
    const allItems = await timeline
      .locator('[data-testid="message-mine"], [data-testid="message-other"], [data-testid^="system-event-"]')
      .all();

    const descriptions: string[] = [];
    for (const item of allItems) {
      const testId = await item.getAttribute("data-testid");
      const text = (await item.innerText()).trim().replace(/\s+/g, " ");
      descriptions.push(`${testId}: ${text}`);
    }

    // Find indices of the key items
    const firstMsgIdx = descriptions.findIndex((d) => d.includes("First message"));
    const addedIdx = descriptions.findIndex((d) => d.startsWith("system-event-added"));
    const secondMsgIdx = descriptions.findIndex((d) => d.includes("Second message"));

    expect(firstMsgIdx, "First message not found in timeline").toBeGreaterThanOrEqual(0);
    expect(addedIdx, "system-event-added not found in timeline").toBeGreaterThanOrEqual(0);
    expect(secondMsgIdx, "Second message not found in timeline").toBeGreaterThanOrEqual(0);

    expect(
      addedIdx,
      `Expected added event (idx ${addedIdx}) to come after first message (idx ${firstMsgIdx})`
    ).toBeGreaterThan(firstMsgIdx);

    expect(
      secondMsgIdx,
      `Expected second message (idx ${secondMsgIdx}) to come after added event (idx ${addedIdx})`
    ).toBeGreaterThan(addedIdx);
  } finally {
    await ctxA.close();
    if (ctxBob) await ctxBob.close();
    if (ctxCharlie) await ctxCharlie.close();
  }
});
