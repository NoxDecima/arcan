import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";
import type { BrowserContext, Page } from "@playwright/test";

/**
 * E2E: Conversation list sorts by most-recent activity
 *
 * Three accounts: Alice, Bob, Carol.
 *   1. Alice and Bob establish mutual contacts; Alice messages Bob
 *   2. Alice and Carol establish mutual contacts; Alice messages Carol
 *   3. Alice's sidebar shows Carol first (more recent), Bob second
 *   4. Alice messages Bob again; Bob rises to top (Carol falls to 2nd)
 *
 * Helper: setupContact(browser, alicePage, name)
 *   - creates a fresh browser context with a new account
 *   - navigates to /contacts/add, captures invite URL
 *   - has Alice accept
 *   - returns the context (caller responsible for closing it)
 */

async function setupContact(
  browser: Parameters<typeof test>[1] extends { browser: infer B } ? B : import("@playwright/test").Browser,
  pageA: Page,
  name: string,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await (browser as import("@playwright/test").Browser).newContext();
  const page = await ctx.newPage();

  await page.goto("/");
  await createAccount(page, name);

  // The new account invites; Alice accepts (asymmetric request/approve flow).
  await establishContact(page, pageA, name);

  return { ctx, page };
}

test("conversation list sorts by most-recent activity", async ({ browser }) => {
  test.setTimeout(180_000); // generous timeout; three contacts + invite flows

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  let ctxBob: BrowserContext | null = null;
  let ctxCarol: BrowserContext | null = null;

  try {
    // ── 1. Create Alice ───────────────────────────────────────────────────────
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    // ── 2. Set up Bob as Alice's contact ────────────────────────────────────
    const { ctx: _ctxBob } = await setupContact(browser, pageA, "Bob");
    ctxBob = _ctxBob;

    // ── 3. Alice starts chat with Bob and sends a message ───────────────────
    await openDirectChat(pageA, "Bob");
    await pageA.getByTestId("composer-input").fill("Hi Bob first");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText("Hi Bob first", {
      timeout: 5_000,
    });

    // ── 4. Set up Carol as Alice's contact ──────────────────────────────────
    const { ctx: _ctxCarol } = await setupContact(browser, pageA, "Carol");
    ctxCarol = _ctxCarol;

    // ── 5. Alice starts chat with Carol and sends a message ──────────────────
    await openDirectChat(pageA, "Carol");
    await pageA.getByTestId("composer-input").fill("Hi Carol second");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText("Hi Carol second", {
      timeout: 5_000,
    });

    // ── 6. Verify Carol is first in Alice's sidebar ──────────────────────────
    await pageA.goto("/conversations");
    await expect(pageA.getByTestId("conversation-row-0")).toBeVisible({ timeout: 10_000 });
    await expect(pageA.getByTestId("conversation-row-0")).toContainText("Carol");
    await expect(pageA.getByTestId("conversation-row-1")).toContainText("Bob");

    // ── 7. Alice messages Bob again; Bob rises to top ────────────────────────
    await pageA.getByTestId("conversation-row-1").click();
    await expect(pageA.getByTestId("conversation-detail")).toBeVisible({ timeout: 10_000 });
    await pageA.getByTestId("composer-input").fill("Hi Bob again");
    await pageA.getByTestId("composer-send-btn").click();
    await expect(pageA.getByTestId("message-timeline")).toContainText("Hi Bob again", {
      timeout: 5_000,
    });

    // Navigate back to conversations list and verify ordering has changed
    await pageA.goto("/conversations");
    await expect(pageA.getByTestId("conversation-row-0")).toBeVisible({ timeout: 10_000 });
    await expect(pageA.getByTestId("conversation-row-0")).toContainText("Bob");
    await expect(pageA.getByTestId("conversation-row-1")).toContainText("Carol");
  } finally {
    await ctxA.close();
    if (ctxBob) await ctxBob.close();
    if (ctxCarol) await ctxCarol.close();
  }
});
