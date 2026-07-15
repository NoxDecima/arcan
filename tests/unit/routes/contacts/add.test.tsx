import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
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
    root: {
      liveInvitations: [
        { $jazz: { id: "inv-1" }, channel: "link" },
        { $jazz: { id: "inv-2" }, channel: "link", revokedAt: new Date() },
      ],
    },
  }),
}));

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ToastProvider>{children}</ToastProvider>
    </MemoryRouter>
  );
}

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search + loc.hash}</div>;
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

describe("AddContactRoute inline paste-a-link (feedback round 3)", () => {
  test("tapping 'or paste a link' reveals an inline field — no prompt() dialog", async () => {
    render(
      <Wrap>
        <AddContactRoute />
      </Wrap>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("add-contact-cancel-btn")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("add-contact-cancel-btn"));
    expect(screen.getByTestId("paste-invite-input")).toBeTruthy();
  });

  test("invalid input shows an inline error and does not navigate", async () => {
    render(
      <Wrap>
        <AddContactRoute />
        <LocationProbe />
      </Wrap>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("add-contact-cancel-btn")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("add-contact-cancel-btn"));
    fireEvent.change(screen.getByTestId("paste-invite-input"), {
      target: { value: "not a link" },
    });
    fireEvent.click(screen.getByTestId("paste-invite-submit"));
    expect(screen.getByTestId("paste-invite-error")).toBeTruthy();
    expect(screen.getByTestId("loc").textContent).toBe("/");
  });

  test("a valid invite URL navigates locally with the origin dropped", async () => {
    render(
      <Wrap>
        <AddContactRoute />
        <LocationProbe />
      </Wrap>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("add-contact-cancel-btn")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("add-contact-cancel-btn"));
    fireEvent.change(screen.getByTestId("paste-invite-input"), {
      target: { value: "https://other-origin.example/invite?via=qr#co_zfrag" },
    });
    fireEvent.click(screen.getByTestId("paste-invite-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toBe(
        "/invite?via=qr#co_zfrag",
      ),
    );
  });

  test("whitespace-only input shows the inline error", async () => {
    render(
      <Wrap>
        <AddContactRoute />
        <LocationProbe />
      </Wrap>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("add-contact-cancel-btn")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("add-contact-cancel-btn"));
    fireEvent.change(screen.getByTestId("paste-invite-input"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByTestId("paste-invite-submit"));
    expect(screen.getByTestId("paste-invite-error")).toBeTruthy();
    expect(screen.getByTestId("loc").textContent).toBe("/");
  });

  test("an /invite string that is not a parseable URL shows the inline error", async () => {
    render(
      <Wrap>
        <AddContactRoute />
        <LocationProbe />
      </Wrap>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("add-contact-cancel-btn")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("add-contact-cancel-btn"));
    fireEvent.change(screen.getByTestId("paste-invite-input"), {
      target: { value: "/invite#co_zfrag" },
    });
    fireEvent.click(screen.getByTestId("paste-invite-submit"));
    expect(screen.getByTestId("paste-invite-error")).toBeTruthy();
    expect(screen.getByTestId("loc").textContent).toBe("/");
  });
});

describe("AddContactRoute invite-links row (feedback round 3)", () => {
  test("quiet row shows the active-invite count", async () => {
    render(
      <Wrap>
        <AddContactRoute />
      </Wrap>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("manage-invites-link")).toBeTruthy(),
    );
    // 2 invitations mocked, 1 revoked → 1 active.
    expect(screen.getByTestId("manage-invites-link").textContent).toContain(
      "1 active",
    );
  });
});
