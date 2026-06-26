import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- mocks: keep the component on the "confirm" phase deterministically ---
vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({ $isLoaded: true, profile: { displayName: "Me" }, root: {} }),
  useIsAuthenticated: () => true,
}));

vi.mock("@/jazz/avatarResolver", () => ({
  useRemoteAvatar: () => undefined, // exercises the initials fallback
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
  test("shows inviter name + avatar on an AuthSurface", async () => {
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
    // Avatar fallback renders the inviter's initial.
    expect(screen.getByTestId("invite-inviter-avatar")).toBeTruthy();
    // AuthSurface backdrop wrapper present.
    expect(document.querySelector("[data-auth-surface]")).toBeTruthy();
  });
});
