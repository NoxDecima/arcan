import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { ChangePasswordRoute } from "@/routes/settings/change-password-route";

vi.mock("@/auth/flows", () => ({
  changePassword: vi.fn(async () => undefined),
}));

import { changePassword } from "@/auth/flows";

function renderRoute() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/settings/change-password"]}>
        <Routes>
          <Route
            path="/settings/change-password"
            element={<ChangePasswordRoute />}
          />
          <Route
            path="/settings"
            element={<div data-testid="settings-index">settings</div>}
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("ChangePasswordRoute", () => {
  beforeEach(() => {
    (changePassword as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  test("successful submit fires success toast and navigates back to /settings", async () => {
    renderRoute();

    fireEvent.change(screen.getByTestId("change-password-current"), {
      target: { value: "old-password-123" },
    });
    fireEvent.change(screen.getByTestId("change-password-new"), {
      target: { value: "new-password-1234" },
    });
    fireEvent.change(screen.getByTestId("change-password-confirm"), {
      target: { value: "new-password-1234" },
    });
    fireEvent.click(screen.getByTestId("change-password-submit"));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("password changed")).toBeTruthy();
    });
    // Navigated back to the settings index (the modal previously called onClose).
    await waitFor(() => {
      expect(screen.getByTestId("settings-index")).toBeTruthy();
    });
  });
});
