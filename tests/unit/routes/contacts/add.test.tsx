import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { AddContactRoute } from "@/routes/contacts/add";

vi.mock("@/components/qr-display", () => ({
  QRDisplay: ({ url }: { url: string }) => <div data-testid="qr-stub">{url}</div>,
}));

vi.mock("@/jazz/invitations", () => ({
  createInvitation: vi.fn(async () => ({ url: "https://test.example/i/abc" })),
  withQrChannelMarker: (url: string) => `${url}?via=qr`,
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

const origShare = (navigator as any).share;

describe("AddContactRoute adaptive copy/share button", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => undefined) },
    });
  });

  afterEach(() => {
    (navigator as any).share = origShare;
    vi.clearAllMocks();
  });

  test("desktop (no navigator.share): single button copies + fires 'invite link copied' toast", async () => {
    delete (navigator as any).share;
    render(
      <Wrap>
        <AddContactRoute />
      </Wrap>
    );
    // Wait for the invitation effect to resolve and the button to become wired.
    await waitFor(() => {
      expect(screen.getByTestId("add-contact-share-btn")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("add-contact-share-btn"));
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

  test("mobile (navigator.share present): single button opens the native share sheet", async () => {
    const share = vi.fn(async () => undefined);
    (navigator as any).share = share;
    render(
      <Wrap>
        <AddContactRoute />
      </Wrap>
    );
    await waitFor(() => {
      expect(screen.getByTestId("add-contact-share-btn")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("add-contact-share-btn"));
    });
    await waitFor(() => {
      expect(share).toHaveBeenCalledWith({ url: "https://test.example/i/abc" });
    });
  });
});
