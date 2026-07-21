import { describe, test, expect, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { PendingConnectionsRoute } from "@/routes/connections/pending";

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
const denySpy = vi.fn(async () => undefined);

vi.mock("@/jazz/invitations", () => ({
  approveConnectionRequest: (...args: any[]) => approveSpy(...args),
  denyConnectionRequest: (...args: any[]) => denySpy(...args),
}));

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "Alice" },
  }),
}));

function makeEntry(dismissedLocally = false) {
  return {
    request: {
      $jazz: { id: "req-1" },
      requesterDisplayName: "Bob Audit",
      requesterAccountID: "bob-account",
      requesterFingerprint: "deadbeef".repeat(8),
    },
    dismissedLocally,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/connections/pending"]}>
      <ToastProvider>
        <Routes>
          <Route path="/connections/pending" element={<>{children}</>} />
          <Route path="/profile/:accountID" element={<LocationProbe />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("PendingConnectionsRoute", () => {
  test("approve fires approveConnectionRequest + success toast", async () => {
    pendingMock.mockReturnValue([makeEntry()]);
    render(
      <Wrap>
        <PendingConnectionsRoute />
      </Wrap>,
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
    pendingMock.mockReturnValue([makeEntry()]);
    render(
      <Wrap>
        <PendingConnectionsRoute />
      </Wrap>,
    );
    fireEvent.click(screen.getByTestId("approve"));
    await waitFor(() =>
      expect(
        screen.getByText("couldn't add contact — still syncing, try again"),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("contact added")).toBeNull();
  });

  test("deny (✗) fires denyConnectionRequest + toast", async () => {
    pendingMock.mockReturnValue([makeEntry()]);
    render(
      <Wrap>
        <PendingConnectionsRoute />
      </Wrap>,
    );
    fireEvent.click(screen.getByTestId("deny"));
    await waitFor(() => expect(denySpy).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText("request denied")).toBeTruthy(),
    );
  });

  test("modal-dismissed requests still render as rows", () => {
    // Walkthrough fix (2026-07-08): clicking the incoming-connection modal
    // away must not empty the pending list.
    pendingMock.mockReturnValue([makeEntry(true)]);
    render(
      <Wrap>
        <PendingConnectionsRoute />
      </Wrap>,
    );
    expect(screen.getAllByTestId("pending-request-row")).toHaveLength(1);
    expect(screen.queryByTestId("pending-empty")).toBeNull();
  });

  test("row body opens the requester's profile", async () => {
    pendingMock.mockReturnValue([makeEntry()]);
    render(
      <Wrap>
        <PendingConnectionsRoute />
      </Wrap>,
    );
    fireEvent.click(screen.getByTestId("pending-open-profile"));
    await waitFor(() =>
      expect(screen.getByTestId("location-probe").textContent).toBe(
        "/profile/bob-account",
      ),
    );
  });

  test("requester avatar image is rendered when resolvable", () => {
    pendingMock.mockReturnValue([makeEntry()]);
    render(
      <Wrap>
        <PendingConnectionsRoute />
      </Wrap>,
    );
    const img = screen
      .getByTestId("pending-open-profile")
      .querySelector("img");
    expect(img?.getAttribute("src")).toBe("blob:bob-avatar");
  });
});
