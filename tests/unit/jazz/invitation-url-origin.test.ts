/**
 * Verifies that createInvitation generates URLs using getServerOrigin()
 * rather than window.location.origin — so that in the Tauri shell the
 * invite link points at the baked server origin, not tauri.localhost.
 */
import { describe, it, expect, afterEach, vi } from "vitest";

// --- module-level mocks (hoisted) ---

// Minimal stub for Jazz: Group.create, Invitation.create, InboxSender, Account
vi.mock("jazz-tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jazz-tools")>();
  return {
    ...actual,
    Group: {
      create: vi.fn(() => ({
        addMember: vi.fn(),
      })),
    },
    InboxSender: actual.InboxSender,
    Account: actual.Account,
  };
});

vi.mock("@/jazz/schema/Invitation", () => ({
  Invitation: {
    create: vi.fn(() => ({
      $jazz: { id: "co_zInv123" },
    })),
  },
}));

vi.mock("@/jazz/schema/ConnectionRequest", () => ({
  ConnectionRequest: { create: vi.fn() },
}));

vi.mock("@/jazz/schema/Contact", () => ({
  Contact: { create: vi.fn() },
}));

vi.mock("@/auth/pubkey", () => ({
  getAccountPubkeyHex: vi.fn(() => "deadbeef"),
}));

// --- tests ---

function enterTauri() {
  (window as any).__TAURI_INTERNALS__ = {};
}

afterEach(() => {
  delete (window as any).__TAURI_INTERNALS__;
  localStorage.clear();
  vi.unstubAllEnvs();
});

describe("createInvitation — URL origin in shell context", () => {
  it("uses the baked VITE_ARCAN_ORIGIN, not tauri.localhost, when in the Tauri shell", async () => {
    enterTauri();
    vi.stubEnv("VITE_ARCAN_ORIGIN", "https://chat.meteory.eu");

    const { createInvitation } = await import("@/jazz/invitations");

    // Minimal account stub
    const fakeAccount = {
      $isLoaded: true,
      $jazz: { id: "co_zMe456" },
      profile: { displayName: "Tester" },
      root: null,
    } as any;

    const { url } = await createInvitation(fakeAccount, "link");

    expect(url).toMatch(/^https:\/\/chat\.meteory\.eu\/invite#/);
    expect(url).not.toMatch(/tauri\.localhost/);
  });

  it("uses window.location.origin on web (unchanged behavior)", async () => {
    // Not Tauri — getServerOrigin() falls through to window.location.origin
    vi.resetModules();
    const { createInvitation } = await import("@/jazz/invitations");

    const fakeAccount = {
      $isLoaded: true,
      $jazz: { id: "co_zMe789" },
      profile: { displayName: "Tester" },
      root: null,
    } as any;

    const { url } = await createInvitation(fakeAccount, "link");

    // In jsdom, window.location.origin is "http://localhost:3000" or similar
    expect(url).toMatch(/^http:\/\/localhost/);
    expect(url).toContain("/invite#");
  });
});
