import { test, expect } from "@playwright/test";
import { createAccount, establishContact, openDirectChat } from "./helpers";

// Feedback round 3: the header back button navigates hierarchically (up),
// never chronologically (history) — see src/nav/parents.ts.
//
// Discrimination principle: each test reaches the profile from a page whose
// chronological parent DIFFERS from the structural (up) target, so a
// navigate(-1) regression causes the assertions to fail.
test.describe("hierarchical up navigation", () => {
  test("own profile → back targets /settings, not the page it was opened from", async ({
    page,
  }) => {
    // We navigate to own profile from the home screen (/?tab=contacts strips to
    // /) via sidebar-header-profile, so the history parent is / — NOT /settings.
    // The hierarchical parent of /profile/:id (own) is /settings (see parents.ts).
    //
    // Discrimination: under a navigate(-1) regression the back button would land
    // on / (the home screen), NOT on /settings — the toHaveURL(/\/settings$/)
    // assertion would fail.
    await createAccount(page, "Nav Own");

    // Reach own profile from home (not settings), so history-back ≠ up-target.
    await page.goto("/?tab=contacts");
    await page.getByTestId("sidebar-header-profile").click();
    await expect(page.getByTestId("profile-view")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("profile-back").click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("contact profile → back lands on contacts tab, not the conversation it was opened from", async ({
    browser,
  }) => {
    // Navigation path: home (/?tab=contacts) → openDirectChat → conversation
    // detail (/conversations/:id) → conversation-header-link → members route
    // (replace) → contact profile (replace).
    //
    // Final history stack on /profile/:id:
    //   … → /?tab=contacts (stripped to /) → /conversations/:id → /profile/:id
    //
    // Chronological back → /conversations/:id
    // Hierarchical up   → /?tab=contacts (navigates to / with contacts tab active)
    //
    // Discrimination: under a navigate(-1) regression, back would land on
    // /conversations/:id — toHaveURL(/\/(\?.*)?$/) and sidebar-contacts-list
    // visibility both fail on that URL.
    const inviterCtx = await browser.newContext();
    const requesterCtx = await browser.newContext();
    const inviterPage = await inviterCtx.newPage();
    const requesterPage = await requesterCtx.newPage();

    await createAccount(inviterPage, "Nav Inviter");
    await createAccount(requesterPage, "Nav Requester");
    await establishContact(inviterPage, requesterPage, "Nav Inviter");

    // Open the 1:1 conversation from the contacts tab (this also navigates
    // through /?tab=contacts, seeding the SidebarTab context).
    await openDirectChat(requesterPage, "Nav Inviter");
    await expect(requesterPage.getByTestId("conversation-detail")).toBeVisible({
      timeout: 15_000,
    });

    // Clicking the conversation header link navigates to /conversations/:id/members,
    // which for a 1:1 immediately <Navigate replace>s to /profile/:contactAccountID
    // (see src/routes/conversations/members.tsx:272). Both hops use replace, so the
    // history entry for /conversations/:id is still the chronological parent.
    await requesterPage.getByTestId("conversation-header-link").click();
    await expect(requesterPage.getByTestId("profile-view")).toBeVisible({
      timeout: 15_000,
    });

    await requesterPage.getByTestId("profile-back").click();

    // Hierarchical up target: /?tab=contacts → ConversationsRoute strips to /
    // via navigate("/", { replace: true }) and leaves the SidebarTab context
    // set to "contacts", so sidebar-contacts-list must be visible.
    await expect(requesterPage).toHaveURL(/\/(\?.*)?$/, { timeout: 10_000 });
    await expect(requesterPage.getByTestId("sidebar-contacts-list")).toBeVisible({
      timeout: 10_000,
    });

    await inviterCtx.close();
    await requesterCtx.close();
  });
});
