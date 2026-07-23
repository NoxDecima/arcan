import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// --- mocks: keep the component on the "confirm" phase deterministically ---
// mockAccount is swappable per-test: the confirm screen renders from the
// GUEST invitation load, so it appears even while `me` is still unloaded —
// the accept CTA must be disabled in that window (regression pin below).
let mockAccount: any = {
  $isLoaded: true,
  profile: { displayName: "Me" },
  root: {},
};
vi.mock("jazz-tools/react", () => ({
  useAccount: () => mockAccount,
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
  mintConnectionRequest: vi.fn(),
  deliverConnectionRequest: vi.fn(),
  readInviteChannel: (search: string) =>
    new URLSearchParams(search).get("via") === "qr" ? "qr" : "link",
}));

// Mock handshake: real withTimeout would need real timers; we stub it so the
// timeout test can simulate a timed-out revalidation without real 15 s waits.
let withTimeoutImpl: (p: Promise<any>, ms: number) => Promise<any> = (p) => p;
vi.mock("@/jazz/handshake", () => ({
  sendConnectionRequest: vi.fn(async () => ({ outcome: "sent" })),
  getContact: vi.fn(() => undefined),
  REQUEST_ACK_TIMEOUT_MS: 15_000,
  withTimeout: (p: Promise<any>, ms: number) => withTimeoutImpl(p, ms),
}));

import { InviteRoute } from "@/routes/invite";

beforeEach(() => {
  // The route reads window.location for the fragment; jsdom default is fine
  // because parseInvitationURL is mocked. Reset the account to loaded.
  mockAccount = { $isLoaded: true, profile: { displayName: "Me" }, root: {} };
  loadInvitationAsGuest.mockClear();
  // Default: withTimeout is transparent (passes through).
  withTimeoutImpl = (p) => p;
});

afterEach(() => {
  // Restore the transparent passthrough so leaking state can't cross tests.
  withTimeoutImpl = (p) => p;
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
    // Loaded account → the accept CTA is live.
    expect(
      (screen.getByTestId("invite-accept-btn") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  // Regression pin (2026-07-21, e2e invite-sent stall): the confirm screen
  // renders from the guest invitation load, so it can appear BEFORE the
  // viewer's account graph resolves. onConnect silently no-ops while
  // !me.$isLoaded — an enabled button in that window eats the tap and the
  // screen never advances (observed as the second establishContact pairing
  // timing out at invite-sent under sync-server load). The CTA must be
  // disabled until the account is loaded.
  test("unloaded account: confirm renders but the accept CTA is disabled", async () => {
    mockAccount = { $isLoaded: false };
    render(
      <MemoryRouter>
        <InviteRoute />
      </MemoryRouter>
    );
    // The window exists: confirm renders without `me`.
    expect(await screen.findByTestId("invite-confirm")).toBeTruthy();
    const accept = screen.getByTestId("invite-accept-btn") as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    // A click in the window is impossible (not silently dropped): the
    // handler must not run — no click-time invitation re-validation fires.
    const callsBefore = loadInvitationAsGuest.mock.calls.length;
    accept.click();
    expect(loadInvitationAsGuest.mock.calls.length).toBe(callsBefore);
    expect(screen.getByTestId("invite-confirm")).toBeTruthy();
  });

  // #54: click-time revalidation timeout → error phase, no send (#54).
  // withTimeout is stubbed to reject immediately (simulating the 15 s wall).
  // The component must: (a) enter the error phase, (b) show the user-friendly
  // message, (c) NOT have called sendConnectionRequest.
  test("revalidation timeout → error phase with friendly message, no send", async () => {
    // Make the revalidation await time out immediately.
    withTimeoutImpl = (_p, _ms) =>
      Promise.reject(new Error("timed out after 15000ms"));

    const { sendConnectionRequest } = await import("@/jazz/handshake");
    (sendConnectionRequest as ReturnType<typeof vi.fn>).mockClear();

    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <InviteRoute />
      </MemoryRouter>
    );
    // Wait for confirm phase.
    expect(await screen.findByTestId("invite-confirm")).toBeTruthy();

    await user.click(screen.getByTestId("invite-accept-btn"));

    // Must enter the error phase (the sr-only phase marker appears).
    expect(await screen.findByTestId("invite-error")).toBeTruthy();
    // User-friendly message is surfaced as the sub-text (visible in the document).
    expect(document.body.textContent).toContain("couldn't verify the invite");
    // sendConnectionRequest must never have been called.
    expect(sendConnectionRequest).not.toHaveBeenCalled();
  });
});
