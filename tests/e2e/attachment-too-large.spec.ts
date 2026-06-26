// tests/e2e/attachment-too-large.spec.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OVERSIZED = path.resolve(__dirname, "fixtures/oversized.bin");

test("oversized files are rejected at pick time", async ({ browser }) => {
  test.setTimeout(60_000);
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();

  try {
    await pageA.goto("/");
    await createAccount(pageA, "Alice");

    // Create a one-user "conversation" via Contacts → cannot start chat without
    // a contact. Use the new-chat picker to get to a detail page is gated.
    // Simpler: just navigate to /conversations and verify the picker route via
    // the contacts-empty path. For this test we only need a page with a
    // Composer rendered. Open settings to set up state, then start a chat with
    // a self-contact would be invalid. So this test needs two accounts:
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto("/");
    await createAccount(pageB, "Bob");

    await establishContact(pageB, pageA, "Bob");
    await openDirectChat(pageA, "Bob");

    await pageA.setInputFiles('[data-testid="composer-file-input"]', OVERSIZED);

    // Tray remains empty
    await expect(pageA.getByTestId("composer-attachment-tray-item")).toHaveCount(0);

    // Inline error appears
    await expect(pageA.getByTestId("composer-error")).toContainText("Max 5 MB");

    // Send button stays disabled (no text either)
    await expect(pageA.getByTestId("composer-send-btn")).toBeDisabled();

    await ctxB.close();
  } finally {
    await ctxA.close();
  }
});
