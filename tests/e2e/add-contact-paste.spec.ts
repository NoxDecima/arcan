import { test, expect } from "@playwright/test";
import { createAccount } from "./helpers";

// Feedback round 3: "or paste a link" reveals an inline text field (the old
// prompt() dialog is unimplemented in Tauri's Android WebView), and the
// invite-links entry is a quiet row above the add-someone divider.
test.describe("add-contact paste flow + invite-links row", () => {
  test("inline paste: invalid shows an error; a valid invite URL opens the accept flow", async ({
    browser,
  }) => {
    const inviterCtx = await browser.newContext();
    const pasterCtx = await browser.newContext();
    const inviterPage = await inviterCtx.newPage();
    const pasterPage = await pasterCtx.newPage();

    await createAccount(inviterPage, "Paste Inviter");
    await createAccount(pasterPage, "Paster");

    await inviterPage.goto("/contacts/add");
    await inviterPage.getByTestId("add-contact-reveal-btn").click();
    const copyUrl = inviterPage.getByTestId("copy-url-text");
    await copyUrl.waitFor({ state: "attached", timeout: 15_000 });
    const inviteUrl = (await copyUrl.textContent())!.trim();

    await pasterPage.goto("/contacts/add");
    await pasterPage.getByTestId("add-contact-cancel-btn").click();
    await pasterPage.getByTestId("paste-invite-input").fill("not a link");
    await pasterPage.getByTestId("paste-invite-submit").click();
    await expect(pasterPage.getByTestId("paste-invite-error")).toBeVisible();

    await pasterPage.getByTestId("paste-invite-input").fill(inviteUrl);
    await pasterPage.getByTestId("paste-invite-submit").click();
    await expect(pasterPage.getByTestId("invite-inviter-name")).toContainText(
      "Paste Inviter",
      { timeout: 15_000 },
    );

    await inviterCtx.close();
    await pasterCtx.close();
  });

  test("invite-links row shows the active count and opens live invites", async ({
    page,
  }) => {
    await createAccount(page, "Inv Row");
    await page.goto("/contacts/add");
    // Invitations are minted lazily (FM10); count is "0 active" until revealed.
    await expect(page.getByTestId("manage-invites-link")).toContainText(
      "active",
    );
    await page.getByTestId("manage-invites-link").click();
    await expect(page).toHaveURL(/\/connections\/live-invites/);
    await page.getByTestId("live-invites-back").click();
    // /?tab=contacts seeds the SidebarTab context then immediately strips to /
    // via navigate("/", { replace: true }) in ConversationsRoute — assert the
    // final URL and that the contacts list is visible (tab is active).
    await expect(page).toHaveURL(/\/(\?.*)?$/);
    await expect(page.getByTestId("sidebar-contacts-list")).toBeVisible();
  });
});
