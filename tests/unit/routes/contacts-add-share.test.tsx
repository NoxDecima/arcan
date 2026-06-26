import { describe, test, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "Me" },
    root: { liveInvitations: { $jazz: { push: vi.fn() } } },
    $jazz: { id: "co_zMyAccount000000000" },
  }),
}));

const createInvitation = vi.fn(async () => ({
  url: "https://arcan.app/invite#abc",
  invitation: {},
}));
vi.mock("@/jazz/invitations", () => ({
  createInvitation: (...a: any[]) => createInvitation(...a),
  // add.tsx renders the QR with the ?via=qr-marked URL — stub it so the
  // component's render path doesn't break. The share/copy button uses the
  // plain inviteUrl, which is what this test asserts.
  withQrChannelMarker: (url: string) => `${url}?via=qr`,
}));

vi.mock("@/components/qr-display", () => ({
  QRDisplay: () => <div data-testid="qr-stub" />,
}));

import { AddContactRoute } from "@/routes/contacts/add";

function Wrap() {
  return (
    <MemoryRouter>
      <ToastProvider>
        <AddContactRoute />
      </ToastProvider>
    </MemoryRouter>
  );
}

const origShare = (navigator as any).share;
const origClipboard = navigator.clipboard;

afterEach(() => {
  (navigator as any).share = origShare;
  Object.defineProperty(navigator, "clipboard", {
    value: origClipboard,
    configurable: true,
  });
  vi.clearAllMocks();
});

describe("AddContactRoute adaptive share button", () => {
  test("desktop (no navigator.share): single button copies + toasts", async () => {
    (navigator as any).share = undefined;
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<Wrap />);
    const btn = await screen.findByTestId("add-contact-share-btn");
    expect(btn.textContent).toContain("copy link");
    // there must be exactly ONE adaptive action button (the old pair is gone)
    expect(screen.queryByTestId("share-link")).toBeNull();
    expect(screen.queryByTestId("add-contact-copy-btn")).toBeNull();

    fireEvent.click(btn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://arcan.app/invite#abc"));
    await waitFor(() => expect(screen.getByText("invite link copied")).toBeTruthy());
  });

  test("mobile (navigator.share present): single button opens the share sheet", async () => {
    const share = vi.fn(async () => undefined);
    (navigator as any).share = share;

    render(<Wrap />);
    const btn = await screen.findByTestId("add-contact-share-btn");
    expect(btn.textContent).toContain("share invite");

    fireEvent.click(btn);
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({ url: "https://arcan.app/invite#abc" })
    );
  });
});
