import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- mocks: keep the component on the "confirm" phase deterministically ---
vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({ $isLoaded: true, profile: { displayName: "Me" }, root: {} }),
  useIsAuthenticated: () => true,
}));

vi.mock("@/components/use-account-avatars", () => ({
  useAccountAvatars: () => new Map(), // exercises the initials fallback
}));

vi.mock("@/hooks/use-shared-groups", () => ({
  useSharedGroups: () => [],
}));

const loadInvitationAsGuest = vi.fn(async () => ({
  inviterAccountID: "inviter-acct",
  inviterFingerprint: "abcd".repeat(16),
  inviterDisplayName: "Carol Inviter",
  channel: "link",
  $jazz: { id: "inv-1" },
}));

vi.mock("@/jazz/invitations", () => ({
  parseInvitationURL: () => ({ invitationID: "inv-1", inviterAccountID: "inviter-acct" }),
  loadInvitationAsGuest: (...a: any[]) => loadInvitationAsGuest(...a),
  createConnectionRequest: vi.fn(),
  readInviteChannel: (search: string) =>
    new URLSearchParams(search).get("via") === "qr" ? "qr" : "link",
}));

import { InviteRoute } from "@/routes/invite";

beforeEach(() => {
  // The route reads window.location for the fragment; jsdom default is fine
  // because parseInvitationURL is mocked. Nothing to set up.
});

describe("InviteRoute confirm phase", () => {
  test("shows inviter name + avatar on the ContactRequestScreen", async () => {
    render(
      <MemoryRouter>
        <InviteRoute />
      </MemoryRouter>
    );
    // Loads async → confirm phase.
    expect(await screen.findByTestId("invite-confirm")).toBeTruthy();
    expect(screen.getByTestId("invite-inviter-name").textContent).toContain(
      "Carol Inviter"
    );
    // Avatar wrapper present (ContactRequestScreen renders avatarTestId on the wrapper div).
    expect(screen.getByTestId("invite-inviter-avatar")).toBeTruthy();
    // Accept + decline buttons present with expected labels.
    expect(screen.getByTestId("invite-accept-btn").textContent).toContain(
      "request to become contacts",
    );
    expect(screen.getByTestId("invite-decline-btn").textContent).toContain(
      "cancel",
    );
  });
});
