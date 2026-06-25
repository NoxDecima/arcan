import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AccountSection } from "@/routes/settings/account-section";

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "decima", avatar: null },
    $jazz: { id: "me-account-id" },
  }),
}));

vi.mock("@/auth/pubkey", () => ({
  getAccountPubkeyHex: () => "deadbeef".repeat(8),
}));

vi.mock("@/components/safety-number", () => ({
  SafetyNumber: () => <div data-testid="safety-number-stub" />,
}));

function renderSection() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/settings" element={<AccountSection />} />
        <Route
          path="/profile/:id"
          element={<div data-testid="profile-page" />}
        />
        <Route
          path="/settings/change-password"
          element={<div data-testid="cp-page" />}
        />
        <Route
          path="/settings/recovery-code"
          element={<div data-testid="rc-page" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AccountSection", () => {
  test("MeRow shows the display name + 'view your profile' and links to the profile", () => {
    renderSection();
    expect(screen.getByText("decima")).toBeTruthy();
    expect(screen.getByText("view your profile")).toBeTruthy();
    fireEvent.click(screen.getByTestId("settings-me-row"));
    expect(screen.getByTestId("profile-page")).toBeTruthy();
  });

  test("change-password row navigates to /settings/change-password", () => {
    renderSection();
    fireEvent.click(screen.getByTestId("change-password-btn"));
    expect(screen.getByTestId("cp-page")).toBeTruthy();
  });

  test("recovery-code row navigates to /settings/recovery-code", () => {
    renderSection();
    fireEvent.click(screen.getByTestId("view-recovery-code-btn"));
    expect(screen.getByTestId("rc-page")).toBeTruthy();
  });

  test("section label reads 'account'", () => {
    renderSection();
    expect(screen.getByText("account")).toBeTruthy();
  });

  test("safety-number row is collapsed by default and expands on click", () => {
    renderSection();
    // collapsed: the SafetyNumber stub is not in the document
    expect(screen.queryByTestId("safety-number-stub")).toBeNull();
    fireEvent.click(screen.getByTestId("safety-number-toggle"));
    expect(screen.getByTestId("safety-number-stub")).toBeTruthy();
    // toggling again collapses
    fireEvent.click(screen.getByTestId("safety-number-toggle"));
    expect(screen.queryByTestId("safety-number-stub")).toBeNull();
  });

  test("safety-number toggle exposes aria-expanded", () => {
    renderSection();
    const btn = screen.getByTestId("safety-number-toggle");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });
});
