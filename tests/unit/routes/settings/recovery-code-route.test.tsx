import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RecoveryCodeRoute } from "@/routes/settings/recovery-code-route";

vi.mock("@/auth/flows", () => ({
  viewRecoveryCode: vi.fn(async () => "word ".repeat(24).trim()),
}));

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/settings/recovery-code"]}>
      <Routes>
        <Route path="/settings/recovery-code" element={<RecoveryCodeRoute />} />
        <Route path="/settings" element={<div data-testid="settings-index" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RecoveryCodeRoute styling", () => {
  test("renders a subtle warning that the code is the master secret", () => {
    renderRoute();
    expect(
      screen.getByText(/anyone with this code can access your account/i),
    ).toBeTruthy();
  });

  test("reveal button carries the destructive red treatment", () => {
    renderRoute();
    const btn = screen.getByTestId("view-recovery-code-submit");
    expect(btn.className).toContain("text-red");
  });
});
