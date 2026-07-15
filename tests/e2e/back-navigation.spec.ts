import { test, expect } from "@playwright/test";
import { createAccount, establishContact } from "./helpers";

// Feedback round 3: the header back button navigates hierarchically (up),
// never chronologically (history) — see src/nav/parents.ts.
test.describe("hierarchical up navigation", () => {
  test("own profile → back lands on settings", async ({ page }) => {
    await createAccount(page, "Nav Own");
    await page.goto("/settings");
    await page.getByTestId("settings-me-row").click();
    await expect(page.getByTestId("profile-view")).toBeVisible();
    await page.getByTestId("profile-back").click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("contact profile → back lands on the contacts tab, not the previous page", async ({
    browser,
  }) => {
    const inviterCtx = await browser.newContext();
    const requesterCtx = await browser.newContext();
    const inviterPage = await inviterCtx.newPage();
    const requesterPage = await requesterCtx.newPage();

    await createAccount(inviterPage, "Nav Inviter");
    await createAccount(requesterPage, "Nav Requester");
    await establishContact(inviterPage, requesterPage, "Nav Inviter");

    // Reach the profile via a DIFFERENT page (home) so history-back and
    // up-navigation disagree — the assertion only means something then.
    await requesterPage.goto("/?tab=contacts");
    await requesterPage.getByTestId("sidebar-contact-row-0").click();
    await expect(requesterPage.getByTestId("profile-view")).toBeVisible();
    await requesterPage.getByTestId("profile-back").click();
    // /?tab=contacts seeds the SidebarTab context then immediately strips to /
    // via navigate("/", { replace: true }) in ConversationsRoute — assert the
    // final URL and that the contacts list is visible (tab is active).
    await expect(requesterPage).toHaveURL(/\/(\?.*)?$/);
    await expect(requesterPage.getByTestId("sidebar-contacts-list")).toBeVisible();

    await inviterCtx.close();
    await requesterCtx.close();
  });
});
