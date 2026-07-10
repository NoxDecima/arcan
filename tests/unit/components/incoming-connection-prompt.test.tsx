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

vi.mock("@/jazz/invitations", () => ({
  approveConnectionRequest: vi.fn(async () => undefined),
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
