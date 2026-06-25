// tests/e2e/_spike-connection-delivery.spec.ts — THROWAWAY DIAGNOSIS SPIKE (Unit 9-0)
//
// NOT for merge. Reverted/promoted in Phase 3. Drives the real two-account
// connection handshake across two browser contexts on one sync server, with
// console capture, to pin where a sent ConnectionRequest is lost on its way
// to the recipient's incoming-request set.
//
// NOTE: the shared createAccount() helper is currently stale against the
// onboarding UI (it looks for label[for="confirm-word-N"] + /Word \d+/, but
// the backup-confirm step renders no `for` attr and labels read "word #NN").
// To keep the spike self-contained and robust we inline a signUp() that reads
// the challenge word number from the "word #NN" span and fills by testid.
import { test, expect, Page } from "@playwright/test";

test.setTimeout(120_000);

/** Robust inline onboarding walk (independent of the stale shared helper). */
async function signUp(page: Page, displayName: string): Promise<void> {
  const id = Math.random().toString(36).slice(2, 10);
  const email = `${displayName}-${id}@example.com`;
  const password = `correcthorsebattery${id}!`;

  await page.goto("/onboarding");
  await page.getByTestId("create-account-btn").click();

  await page.getByTestId("credentials-email").fill(email);
  await page.getByTestId("credentials-password").fill(password);
  await page.getByTestId("credentials-confirm").fill(password);
  await page.getByTestId("credentials-continue").click();

  // Capture the 24 words from the passphrase grid.
  await page.getByTestId("passphrase-grid").waitFor({ timeout: 20_000 });
  const words: string[] = [];
  for (let i = 1; i <= 24; i++) {
    const span = page.getByTestId(`passphrase-word-${i}`).locator("span").nth(1);
    words.push(((await span.textContent()) ?? "").trim());
  }
  await page.getByTestId("passphrase-saved-checkbox").check();
  await page.getByTestId("passphrase-display-continue").click();

  // Backup confirm: each slot's label span reads "word #NN" -> use NN to pick.
  for (let slot = 0; slot < 3; slot++) {
    const input = page.getByTestId(`confirm-word-${slot}`);
    await input.waitFor({ timeout: 20_000 });
    // The label number lives in the sibling span of the same <label>.
    const labelText =
      (await input.locator("xpath=../span").first().textContent()) ?? "";
    const m = labelText.match(/#?\s*0*(\d+)/);
    if (!m) throw new Error(`Could not parse confirm label: "${labelText}"`);
    const wordNum = parseInt(m[1], 10); // 1-based
    await input.fill(words[wordNum - 1]);
  }
  await page.getByTestId("confirm-passphrase-btn").click();

  await page.getByTestId("display-name-input").fill(displayName);
  await page.getByTestId("finish-onboarding-btn").click();
  await page.getByTestId("home-main").waitFor({ timeout: 30_000 });
}

test("SPIKE: connection request reaches recipient pending set", async ({
  browser,
}) => {
  // Bob (recipient) — signs up, opens /contacts/add, exposes invite URL.
  const bobCtx = await browser.newContext();
  const bob = await bobCtx.newPage();
  bob.on("console", (m) => console.log("[BOB]", m.type(), m.text()));
  bob.on("pageerror", (e) => console.log("[BOB] pageerror", String(e)));
  await signUp(bob, "bob");
  await bob.goto("/contacts/add");
  await bob.getByTestId("qr-url-text").waitFor({ timeout: 20_000 });
  const inviteUrl = ((await bob.getByTestId("qr-url-text").textContent()) ?? "").trim();
  console.log("[SPIKE] inviteUrl=", inviteUrl);

  // Alice (requester) — signs up, opens the invite, accepts → mints request.
  const aliceCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  alice.on("console", (m) => console.log("[ALICE]", m.type(), m.text()));
  alice.on("pageerror", (e) => console.log("[ALICE] pageerror", String(e)));
  await signUp(alice, "alice");
  await alice.goto(inviteUrl);
  await alice.getByTestId("invite-accept-btn").click();
  await alice.getByTestId("invite-sent").waitFor({ timeout: 30_000 });
  console.log("[SPIKE] alice reached invite-sent");

  // Bob — navigate to the pending surface; the request should appear.
  await bob.goto("/connections/pending");
  // Give the inbox subscription time to load + replay the message.
  await bob.waitForTimeout(10_000);

  const anyPendingRow = bob.locator('[data-testid^="pending-co_"]');
  const pendingRowCount = await anyPendingRow.count();
  console.log("[SPIKE] pending-co_* row count on Bob =", pendingRowCount);

  const planSelectorCount = await bob.getByTestId("pending-request-row").count();
  console.log("[SPIKE] pending-request-row count =", planSelectorCount);

  const emptyVisible = await bob
    .getByTestId("pending-empty")
    .isVisible()
    .catch(() => false);
  console.log("[SPIKE] pending-empty visible =", emptyVisible);

  expect(pendingRowCount).toBeGreaterThan(0);
});
