import { describe, test, expect, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { PendingRequestsSection } from "@/components/pending-requests-section";

const pendingMock = vi.fn();
vi.mock("@/jazz/use-incoming-connection-requests", () => ({
  useIncomingConnectionRequests: () => pendingMock(),
}));

vi.mock("@/components/use-account-avatars", () => ({
  useAccountAvatars: () => new Map([["bob-account", "blob:bob-avatar"]]),
}));

const approveSpy = vi.fn(async () => undefined);
const denySpy = vi.fn(async () => undefined);
vi.mock("@/jazz/invitations", () => ({
  approveConnectionRequest: (...a: any[]) => approveSpy(...a),
  denyConnectionRequest: (...a: any[]) => denySpy(...a),
}));

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({ $isLoaded: true, profile: { displayName: "Alice" } }),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/"]}>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<>{children}</>} />
          <Route path="/profile/:accountID" element={<LocationProbe />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  );
}

const oneRequest = [
  {
    request: {
      $jazz: { id: "req-1" },
      requesterDisplayName: "Bob Tester",
      requesterAccountID: "bob-account",
      requesterFingerprint: "deadbeef".repeat(8),
      channel: "link",
    },
    dismissedLocally: false,
  },
];

describe("PendingRequestsSection", () => {
  test("renders nothing when there are no pending requests", () => {
    pendingMock.mockReturnValue([]);
    const { container } = render(
      <Wrap>
        <PendingRequestsSection />
      </Wrap>
    );
    expect(container.querySelector('[data-testid="pending-section"]')).toBeNull();
  });

  test("renders a row per pending request with the requester name", () => {
    pendingMock.mockReturnValue(oneRequest);
    render(
      <Wrap>
        <PendingRequestsSection />
      </Wrap>
    );
    expect(screen.getByTestId("pending-section")).toBeTruthy();
    expect(screen.getAllByTestId("pending-section-row")).toHaveLength(1);
    expect(screen.getByText("Bob Tester")).toBeTruthy();
  });

  test("approve (✓) fires approveConnectionRequest + a success toast", async () => {
    pendingMock.mockReturnValue(oneRequest);
    render(
      <Wrap>
        <PendingRequestsSection />
      </Wrap>
    );
    fireEvent.click(screen.getByTestId("pending-section-approve"));
    await waitFor(() => expect(approveSpy).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("contact added")).toBeTruthy());
  });

  test("deny (✗) fires denyConnectionRequest", async () => {
    pendingMock.mockReturnValue(oneRequest);
    render(
      <Wrap>
        <PendingRequestsSection />
      </Wrap>
    );
    fireEvent.click(screen.getByTestId("pending-section-decline"));
    await waitFor(() => expect(denySpy).toHaveBeenCalled());
  });

  test("row body opens the requester's profile", async () => {
    pendingMock.mockReturnValue(oneRequest);
    render(
      <Wrap>
        <PendingRequestsSection />
      </Wrap>
    );
    fireEvent.click(screen.getByTestId("pending-section-open-profile"));
    await waitFor(() =>
      expect(screen.getByTestId("location-probe").textContent).toBe(
        "/profile/bob-account",
      ),
    );
  });

  test("requester avatar image is rendered when resolvable", () => {
    pendingMock.mockReturnValue(oneRequest);
    render(
      <Wrap>
        <PendingRequestsSection />
      </Wrap>
    );
    const img = screen
      .getByTestId("pending-section-open-profile")
      .querySelector("img");
    expect(img?.getAttribute("src")).toBe("blob:bob-avatar");
  });
});
