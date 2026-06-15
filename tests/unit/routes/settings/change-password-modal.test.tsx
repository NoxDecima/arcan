import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/toast";
import { ChangePasswordModal } from "@/routes/settings/change-password-modal";

vi.mock("@/auth/flows", () => ({
  changePassword: vi.fn(async () => undefined),
}));

import { changePassword } from "@/auth/flows";

function Wrap({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("ChangePasswordModal", () => {
  beforeEach(() => {
    (changePassword as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  test("successful submit fires success toast and calls onClose", async () => {
    const onClose = vi.fn();
    render(
      <Wrap>
        <ChangePasswordModal onClose={onClose} />
      </Wrap>
    );

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
    expect(onClose).toHaveBeenCalled();
  });
});
