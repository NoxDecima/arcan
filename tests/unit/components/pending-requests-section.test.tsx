import { describe, test, expect, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { PendingRequestsSection } from "@/components/pending-requests-section";

const pendingMock = vi.fn();
vi.mock("@/jazz/use-incoming-connection-requests", () => ({
  useIncomingConnectionRequests: () => pendingMock(),
}));

vi.mock("@/hooks/use-shared-groups", () => ({
  useSharedGroups: () => [],
}));

const approveSpy = vi.fn(async () => undefined);
const dismissSpy = vi.fn(async () => undefined);
vi.mock("@/jazz/invitations", () => ({
  approveConnectionRequest: (...a: any[]) => approveSpy(...a),
  dismissConnectionRequest: (...a: any[]) => dismissSpy(...a),
}));

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({ $isLoaded: true, profile: { displayName: "Alice" } }),
}));

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <ToastProvider>{children}</ToastProvider>
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

  test("approve fires approveConnectionRequest + a success toast", async () => {
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

  test("decline fires dismissConnectionRequest", async () => {
    pendingMock.mockReturnValue(oneRequest);
    render(
      <Wrap>
        <PendingRequestsSection />
      </Wrap>
    );
    fireEvent.click(screen.getByTestId("pending-section-decline"));
    await waitFor(() => expect(dismissSpy).toHaveBeenCalled());
  });
});
