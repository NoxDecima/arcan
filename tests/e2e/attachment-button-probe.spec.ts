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

      // Long-conversation regression (walkthrough 2026-07-05): fill the
      // timeline past one screen, then verify the composer is still visible
      // and the timeline actually scrolls (missing min-h-0 on <main> made
      // the pane overflow instead of scrolling, hiding composer + tray).
      for (let i = 1; i <= 22; i++) {
        await pageA.getByTestId("composer-input").fill(`filler ${i}`);
        await pageA.getByTestId("composer-send-btn").click();
      }
      await expect(pageA.getByTestId("composer-send-btn")).toBeInViewport();

      // Enter-send keeps keyboard focus in the input (walkthrough
      // 2026-07-05: the sending state used to hard-disable the input,
      // dropping focus after every message).
      await pageA.getByTestId("composer-input").fill("focus check");
      await pageA.getByTestId("composer-input").press("Enter");
      await expect(pageA.getByTestId("message-timeline")).toContainText(
        "focus check",
        { timeout: 10_000 },
      );
      await expect(pageA.getByTestId("composer-input")).toBeFocused();
      const scrollable = await pageA
        .getByTestId("message-timeline")
        .evaluate((el) => el.scrollHeight > el.clientHeight + 10);
      expect(scrollable).toBe(true);

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
