import { describe, test, expect, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/toast";
import { PendingConnectionsRoute } from "@/routes/connections/pending";

vi.mock("@/jazz/use-incoming-connection-requests", () => ({
  useIncomingConnectionRequests: () => [
    {
      request: {
        $jazz: { id: "req-1" },
        requesterDisplayName: "Bob Audit",
        requesterAccountID: "bob-account",
        requesterFingerprint: "deadbeef".repeat(8),
      },
    },
  ],
}));

vi.mock("@/hooks/use-shared-groups", () => ({
  useSharedGroups: () => [],
}));

const approveSpy = vi.fn(async () => undefined);
const dismissSpy = vi.fn(async () => undefined);

vi.mock("@/jazz/invitations", () => ({
  approveConnectionRequest: (...args: any[]) => approveSpy(...args),
  dismissConnectionRequest: (...args: any[]) => dismissSpy(...args),
}));

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "Alice" },
  }),
}));

function Wrap({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("PendingConnectionsRoute", () => {
  test("dismiss action fires a 'request dismissed' toast", async () => {
    render(
      <Wrap>
        <PendingConnectionsRoute />
      </Wrap>
    );
    fireEvent.click(screen.getByTestId("dismiss"));
    await waitFor(() => expect(dismissSpy).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByText("request dismissed")).toBeTruthy();
    });
  });
});
