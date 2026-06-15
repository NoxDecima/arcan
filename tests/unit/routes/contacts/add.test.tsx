import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { AddContactRoute } from "@/routes/contacts/add";

vi.mock("@/components/qr-display", () => ({
  QRDisplay: ({ url }: { url: string }) => <div data-testid="qr-stub">{url}</div>,
}));

vi.mock("@/jazz/invitations", () => ({
  createInvitation: vi.fn(async () => ({ url: "https://test.example/i/abc" })),
}));

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    $jazz: { id: "alice-account-id" },
    profile: { displayName: "Alice" },
  }),
}));

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ToastProvider>{children}</ToastProvider>
    </MemoryRouter>
  );
}

describe("AddContactRoute copy/share toast", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => undefined) },
    });
  });

  test("copy-link button fires 'invite link copied' toast", async () => {
    render(
      <Wrap>
        <AddContactRoute />
      </Wrap>
    );
    // Wait for the invitation effect to resolve and the button to become wired.
    await waitFor(() => {
      expect(screen.getByTestId("add-contact-copy-btn")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("add-contact-copy-btn"));
    });
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "https://test.example/i/abc",
      );
    });
    await waitFor(() => {
      expect(screen.getByText("invite link copied")).toBeTruthy();
    });
  });

  test("share button falls back to clipboard + 'link copied' toast when navigator.share is unavailable", async () => {
    // Ensure navigator.share is not defined for this test.
    delete (navigator as any).share;
    render(
      <Wrap>
        <AddContactRoute />
      </Wrap>
    );
    await waitFor(() => {
      expect(screen.getByTestId("share-link")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("share-link"));
    });
    await waitFor(() => {
      expect(screen.getByText("link copied")).toBeTruthy();
    });
  });
});
