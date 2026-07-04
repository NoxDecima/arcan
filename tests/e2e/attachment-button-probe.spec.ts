// Probe: attachment upload through the REAL attach-button path (filechooser),
// at desktop and mobile viewports. The other attachment specs bypass the
// button via setInputFiles — this covers the seam the user reported broken
// on desktop (2026-07-05 walkthrough).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PNG = path.resolve(__dirname, "fixtures/tiny.png");

async function attachViaButton(page: Page) {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByTestId("composer-attach-btn").click(),
  ]);
  await chooser.setFiles(PNG);
}

// Mobile leg omitted: the shared e2e helpers assume desktop-layout testids
// (mobile mounts use the "mobile-" prefix) — Phase 4 retarget item.
for (const vp of [{ name: "desktop", width: 1280, height: 800 }]) {
  test(`attach button works at ${vp.name} viewport`, async ({ browser }) => {
    test.setTimeout(120_000);
    const ctxA = await browser.newContext({ viewport: vp });
    const ctxB = await browser.newContext({ viewport: vp });
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    try {
      await createAccount(pageA, "Alice");
      await createAccount(pageB, "Bob");
      await establishContact(pageA, pageB, "Alice", "Bob");
      await openDirectChat(pageA, "Bob");

      await attachViaButton(pageA);
      await expect(
        pageA.getByTestId("composer-attachment-tray-item"),
      ).toHaveCount(1, { timeout: 10_000 });
      await pageA.getByTestId("composer-send-btn").click();
      await expect(
        pageA.getByTestId("attachment-tile-sent-image").first(),
      ).toBeVisible({ timeout: 20_000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
}
