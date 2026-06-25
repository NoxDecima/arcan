import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignOutCard } from "@/routes/settings/sign-out-card";

const logOut = vi.fn();
const signOut = vi.fn(async () => undefined);

vi.mock("jazz-tools/react", () => ({
  useLogOut: () => logOut,
}));
vi.mock("@/auth/client", () => ({
  authClient: { signOut: () => signOut() },
}));

describe("SignOutCard", () => {
  beforeEach(() => {
    logOut.mockClear();
    signOut.mockClear();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  test("renders a red sign-out row with a logout icon", () => {
    const { container } = render(<SignOutCard />);
    const label = screen.getByText("sign out");
    expect(label.className).toContain("text-red");
    expect(container.querySelector("svg")).toBeTruthy();
  });

  test("clicking confirms, calls authClient.signOut() then logOut()", async () => {
    render(<SignOutCard />);
    fireEvent.click(screen.getByTestId("sign-out-btn"));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(logOut).toHaveBeenCalled());
  });

  test("cancelling the confirm dialog does not sign out", () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<SignOutCard />);
    fireEvent.click(screen.getByTestId("sign-out-btn"));
    expect(logOut).not.toHaveBeenCalled();
  });
});
