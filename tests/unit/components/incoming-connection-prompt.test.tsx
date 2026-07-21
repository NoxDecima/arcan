import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/toast";
import { IncomingConnectionPrompt } from "@/components/incoming-connection-prompt";

const pendingMock = vi.fn();
vi.mock("@/jazz/use-incoming-connection-requests", () => ({
  useIncomingConnectionRequests: () => pendingMock(),
}));

vi.mock("@/hooks/use-shared-groups", () => ({
  useSharedGroups: () => [],
}));

vi.mock("@/components/use-account-avatars", () => ({
  useAccountAvatars: () => new Map([["bob-account", "blob:bob-avatar"]]),
}));

// Default: approve succeeds ("approved"). Individual tests override the
// resolved outcome ("unavailable" → honest retry toast — approver-side
// silent-loss fix: success is only toasted on an actual "approved").
const approveSpy = vi.fn(async (..._a: any[]): Promise<string> => "approved");
vi.mock("@/jazz/invitations", () => ({
  approveConnectionRequest: (...a: any[]) => approveSpy(...a),
  dismissConnectionRequest: vi.fn(async () => undefined),
  denyConnectionRequest: vi.fn(async () => undefined),
}));

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({ $isLoaded: true, profile: { displayName: "Alice" } }),
}));

function makeEntry(dismissedLocally: boolean) {
  return {
    request: {
      $jazz: { id: "req-1" },
      requesterDisplayName: "Bob Tester",
      requesterAccountID: "bob-account",
      requesterFingerprint: "deadbeef".repeat(8),
      channel: "qr",
    },
    dismissedLocally,
  };
}

describe("IncomingConnectionPrompt", () => {
  test("renders the modal for an undismissed qr request, with avatar image", () => {
    pendingMock.mockReturnValue([makeEntry(false)]);
    render(
      <ToastProvider>
        <IncomingConnectionPrompt />
      </ToastProvider>
    );
    const modal = screen.getByTestId("incoming-connection-prompt");
    expect(modal).toBeTruthy();
    const img = modal.querySelector("img");
    expect(img?.getAttribute("src")).toBe("blob:bob-avatar");
    // Feedback round 2: display name is its own line, separated from the
    // "wants to connect" sentence.
    expect(screen.getByText("Bob Tester")).toBeTruthy();
    expect(screen.getByText("wants to connect")).toBeTruthy();
    expect(screen.getByText("scanned your QR code in person")).toBeTruthy();
    // a11y: the dialog must have an accessible name so screen readers can
    // identify it (aria-labelledby pointing at the <h2>).
    expect(screen.getByRole("dialog", { name: "connection request" })).toBeTruthy();
  });

  test("approve outcome 'approved' → success toast", async () => {
    pendingMock.mockReturnValue([makeEntry(false)]);
    render(
      <ToastProvider>
        <IncomingConnectionPrompt />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByTestId("approve"));
    await waitFor(() => expect(approveSpy).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("contact added")).toBeTruthy());
  });

  test("approve outcome 'unavailable' → honest retry toast, NO 'contact added'", async () => {
    // Approver-side silent-loss fix: contacts record unloaded at click means
    // nothing was written or stamped — the toast must say so, not claim
    // success.
    approveSpy.mockResolvedValueOnce("unavailable");
    pendingMock.mockReturnValue([makeEntry(false)]);
    render(
      <ToastProvider>
        <IncomingConnectionPrompt />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByTestId("approve"));
    await waitFor(() =>
      expect(
        screen.getByText("couldn't add contact — still syncing, try again"),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("contact added")).toBeNull();
  });

  test("decline button denies the request", async () => {
    pendingMock.mockReturnValue([makeEntry(false)]);
    const { denyConnectionRequest } = await import("@/jazz/invitations");
    render(
      <ToastProvider>
        <IncomingConnectionPrompt />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByTestId("decline"));
    await waitFor(() => expect(denyConnectionRequest).toHaveBeenCalled());
  });

  test("stays closed for a locally-dismissed qr request", () => {
    // Dismissal mutes the modal only — the request remains on the pending
    // surfaces (user decision, 2026-07-08 walkthrough).
    pendingMock.mockReturnValue([makeEntry(true)]);
    render(
      <ToastProvider>
        <IncomingConnectionPrompt />
      </ToastProvider>
    );
    expect(screen.queryByTestId("incoming-connection-prompt")).toBeNull();
  });
});
