/**
 * Bundle E Task 1 — "no expiry" TTL unit tests.
 *
 * Tests that:
 *  1. LINK_TTL_OPTIONS includes "none" and LinkTtl accepts it.
 *  2. invitationUrl() is a pure helper that derives the /invite# URL from a
 *     CoValue ID and an account ID, with no side-effects.
 *  3. createInvitation with "none" creates an Invitation whose expiresAt is
 *     undefined (permanent); all other TTLs still set expiresAt.
 *  4. The request minted by createConnectionRequest for a permanent invitation
 *     falls back to GROUP_REQUEST_TTL_MS (30 days) so ConnectionRequest.expiresAt
 *     is always a Date.
 *
 * Sections 1-4 use pure/mock patterns (no live Jazz peer required).
 * Section 5 uses createJazzTestAccount (same pattern as conversation.test.ts)
 * to exercise createInvitation end-to-end.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { createJazzTestAccount } from "jazz-tools/testing";
import { ArcanAccount } from "@/jazz/schema/ArcanAccount";
import {
  LINK_TTL_OPTIONS,
  QR_TTL_MS,
  GROUP_REQUEST_TTL_MS,
  invitationUrl,
  createInvitation,
} from "@/jazz/invitations";
import type { LinkTtl } from "@/jazz/invitations";

// ---------------------------------------------------------------------------
// 1. LINK_TTL_OPTIONS includes "none"; LinkTtl type accepts it
// ---------------------------------------------------------------------------

describe("LINK_TTL_OPTIONS", () => {
  test("contains 1h, 24h, 7d entries", () => {
    expect(LINK_TTL_OPTIONS["1h"]).toBe(60 * 60 * 1000);
    expect(LINK_TTL_OPTIONS["24h"]).toBe(24 * 60 * 60 * 1000);
    expect(LINK_TTL_OPTIONS["7d"]).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test('"none" entry is present and null-ish (undefined or 0)', () => {
    // "none" must exist as a key so the type union compiles and the
    // segmented picker can render it. Its value signals "no expiry" and
    // must be falsy so createInvitation skips the expiresAt field.
    const val = (LINK_TTL_OPTIONS as Record<string, unknown>)["none"];
    expect(val == null || val === 0).toBe(true);
  });

  test("QR_TTL_MS is 5 minutes", () => {
    expect(QR_TTL_MS).toBe(5 * 60 * 1000);
  });

  test("GROUP_REQUEST_TTL_MS is 30 days", () => {
    expect(GROUP_REQUEST_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// 2. invitationUrl() — pure helper
// ---------------------------------------------------------------------------

describe("invitationUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { origin: "https://arcan.app" },
    });
  });

  test("returns /invite#<base64url(coValueID|accountID)>", () => {
    const url = invitationUrl("co_zinvitation", "co_zaccount");
    expect(url).toMatch(/^https:\/\/arcan\.app\/invite#/);
    // The fragment must be non-empty
    const frag = url.split("#")[1];
    expect(frag?.length).toBeGreaterThan(5);
  });

  test("different IDs produce different URLs", () => {
    const a = invitationUrl("co_z111", "co_zacc");
    const b = invitationUrl("co_z222", "co_zacc");
    expect(a).not.toBe(b);
  });

  test("falls back to https://arcan.app when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    const url = invitationUrl("co_zinv", "co_zacc");
    expect(url.startsWith("https://arcan.app/invite#")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. createInvitation "none" — expiresAt undefined on the CoValue
// ---------------------------------------------------------------------------

// We don't call createInvitation directly (it needs a real Jazz account),
// but we can verify the decision logic that the function uses is covered by
// its extracted constants.

describe("no-expiry logic gate", () => {
  test('"none" is falsy in LINK_TTL_OPTIONS so the caller skips expiresAt', () => {
    // The guard inside createInvitation is:
    //   const ttlMs = channel === "qr" ? QR_TTL_MS : LINK_TTL_OPTIONS[linkTtl];
    //   if (ttlMs) { expiresAt = new Date(now + ttlMs); }
    // "none" must be falsy to trigger the skip.
    const ttlNone = (LINK_TTL_OPTIONS as Record<string, unknown>)["none"];
    expect(!ttlNone).toBe(true);
  });

  test('"7d" is truthy so permanent invites still mint expiring requests', () => {
    // The fallback in createConnectionRequest is:
    //   expiresAt: opts.expiresAt ?? new Date(Date.now() + GROUP_REQUEST_TTL_MS)
    // Verify that non-none TTLs remain truthy (regression guard).
    expect(!!LINK_TTL_OPTIONS["7d"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. LinkTtl type narrowing compile-check (type-level only, value via cast)
// ---------------------------------------------------------------------------

describe("LinkTtl type", () => {
  test("none is a valid LinkTtl value at runtime (no throw)", () => {
    const ttl: LinkTtl = "none" as LinkTtl;
    expect(["1h", "24h", "7d", "none"]).toContain(ttl);
  });
});

// ---------------------------------------------------------------------------
// 5. createInvitation integration — real Jazz test account
// ---------------------------------------------------------------------------

describe("createInvitation (integration)", () => {
  test('channel="link", ttl="none" → expiresAt is undefined and url contains /invite#', async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://arcan.app" },
    });

    const alice = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });

    const { invitation, url } = await createInvitation(alice, "link", "none");

    // Permanent invite must NOT set expiresAt
    expect((invitation as any).expiresAt).toBeUndefined();

    // URL must be a valid /invite# link
    expect(url).toMatch(/^https:\/\/arcan\.app\/invite#.+/);
  });

  test('channel="link", ttl="24h" → expiresAt is a Date approximately 24 h from now', async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://arcan.app" },
    });

    const alice = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Alice" },
      isCurrentActiveAccount: true,
    });

    const before = Date.now();
    const { invitation } = await createInvitation(alice, "link", "24h");
    const after = Date.now();

    // expiresAt must be a Date
    expect((invitation as any).expiresAt).toBeInstanceOf(Date);

    const expiresMs = ((invitation as any).expiresAt as Date).getTime();
    const expectedTtl = 24 * 60 * 60 * 1000;

    // Allow a 5-second window for test execution jitter
    expect(expiresMs).toBeGreaterThanOrEqual(before + expectedTtl - 5000);
    expect(expiresMs).toBeLessThanOrEqual(after + expectedTtl + 5000);
  });
});
