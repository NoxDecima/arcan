import { describe, test, expect, vi, beforeEach } from "vitest";

const mintSpy = vi.fn();
const deliverSpy = vi.fn();
vi.mock("@/jazz/invitations", () => ({
  mintConnectionRequest: (...args: unknown[]) => mintSpy(...args),
  deliverConnectionRequest: (...args: unknown[]) => deliverSpy(...args),
  GROUP_REQUEST_TTL_MS: 30 * 24 * 60 * 60 * 1000,
}));
vi.mock("@/jazz/schema/OutgoingConnectionRequest", () => ({
  OutgoingConnectionRequest: {
    create: (init: Record<string, unknown>) => {
      const entry: any = { ...init };
      entry.$jazz = {
        set: vi.fn((k: string, v: unknown) => {
          entry[k] = v;
        }),
      };
      return entry;
    },
  },
}));
vi.mock("@/jazz/schema/Contact", () => ({
  Contact: { create: (init: Record<string, unknown>) => ({ ...init }) },
  ContactBook: {},
}));

import { sendConnectionRequest, REQUEST_MIN_TTL_MS } from "@/jazz/handshake";

const COUNTERPART = {
  accountID: "acc-inviter",
  fingerprint: "fp-inviter",
  displayName: "Ida",
};

function makeMe(opts: {
  contacts?: Record<string, any>;
  outgoing?: Record<string, any>;
  /** Override $jazz.has — lets a key be "present" while the proxy read is null. */
  outgoingHas?: (key: string) => boolean;
} = {}) {
  const outgoingSet = vi.fn();
  const outgoing: any = { ...(opts.outgoing ?? {}) };
  outgoing.$jazz = {
    set: outgoingSet,
    // Real CoRecord semantics: has(key) reflects raw key presence.
    has: vi.fn((key: string) =>
      opts.outgoingHas ? opts.outgoingHas(key) : key in (opts.outgoing ?? {}),
    ),
  };
  const contacts: any = { ...(opts.contacts ?? {}) };
  contacts.$jazz = { set: vi.fn() };
  const me = { $jazz: { id: "me-acc" }, root: { contacts, outgoingRequests: outgoing } };
  return { me, outgoingSet };
}

beforeEach(() => {
  mintSpy.mockReset().mockReturnValue({
    $jazz: { id: "req-1" },
    expiresAt: new Date(Date.now() + REQUEST_MIN_TTL_MS),
  });
  deliverSpy.mockReset().mockResolvedValue(undefined);
});

describe("sendConnectionRequest", () => {
  test("short-circuits when already a contact — nothing minted or sent", async () => {
    const { me, outgoingSet } = makeMe({
      contacts: { "acc-inviter": { contactAccountID: "acc-inviter" } },
    });
    const result = await sendConnectionRequest(me as any, COUNTERPART, {
      channel: "invite",
      requestChannel: "link",
    });
    expect(result.outcome).toBe("already-contact");
    expect(mintSpy).not.toHaveBeenCalled();
    expect(outgoingSet).not.toHaveBeenCalled();
  });

  test("short-circuits when a live pending entry exists", async () => {
    const pendingEntry = {
      status: "pending",
      request: { expiresAt: new Date(Date.now() + 60_000) },
    };
    const { me } = makeMe({ outgoing: { "acc-inviter": pendingEntry } });
    const result = await sendConnectionRequest(me as any, COUNTERPART, {
      channel: "invite",
      requestChannel: "link",
    });
    expect(result.outcome).toBe("already-pending");
    expect(mintSpy).not.toHaveBeenCalled();
  });

  test("present-but-unloaded outgoing entry → unavailable; never re-points the key", async () => {
    // Real CoRecord semantics: $jazz.has(key) is true while the proxy read
    // still returns null until the entry CoValue loads. Minting here would
    // silently re-point the key at a fresh entry, orphaning the durable
    // pending request (mirrors the upsertContact guard).
    const { me, outgoingSet } = makeMe({
      outgoingHas: (key) => key === "acc-inviter",
    });
    const result = await sendConnectionRequest(me as any, COUNTERPART, {
      channel: "invite",
      requestChannel: "link",
    });
    expect(result.outcome).toBe("unavailable");
    expect(mintSpy).not.toHaveBeenCalled();
    expect(deliverSpy).not.toHaveBeenCalled();
    expect(outgoingSet).not.toHaveBeenCalled();
  });

  test("happy path: durable entry written BEFORE delivery; ack sets deliveredAt", async () => {
    const { me, outgoingSet } = makeMe();
    const result = await sendConnectionRequest(me as any, COUNTERPART, {
      channel: "invite",
      requestChannel: "link",
      invitationID: "inv-1",
    });
    expect(result.outcome).toBe("sent");
    expect(outgoingSet).toHaveBeenCalledTimes(1);
    const [key, entry] = outgoingSet.mock.calls[0];
    expect(key).toBe("acc-inviter");
    expect(entry.status).toBe("pending");
    expect(entry.channel).toBe("invite");
    expect(entry.counterpartFingerprint).toBe("fp-inviter");
    // durable intent first: the record write happened before delivery started
    expect(outgoingSet.mock.invocationCallOrder[0]).toBeLessThan(
      deliverSpy.mock.invocationCallOrder[0],
    );
    expect(entry.deliveredAt).toBeInstanceOf(Date);
  });

  test("delivery failure marks the durable entry failed (watcher retries)", async () => {
    deliverSpy.mockRejectedValue(new Error("offline"));
    const { me, outgoingSet } = makeMe();
    const result = await sendConnectionRequest(me as any, COUNTERPART, {
      channel: "invite",
      requestChannel: "link",
    });
    expect(result.outcome).toBe("send-failed");
    const entry = outgoingSet.mock.calls[0][1];
    expect(entry.status).toBe("failed");
    expect(entry.deliveredAt).toBeUndefined();
  });

  test("invite-channel TTL: request expiry is max(invitationExpiry, sentAt + 7d)", async () => {
    const { me } = makeMe();
    const shortExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 h link
    await sendConnectionRequest(me as any, COUNTERPART, {
      channel: "invite",
      requestChannel: "link",
      invitationExpiresAt: shortExpiry,
    });
    const mintOpts = mintSpy.mock.calls[0][3] as { expiresAt: Date };
    expect(mintOpts.expiresAt.getTime()).toBeGreaterThanOrEqual(
      Date.now() + REQUEST_MIN_TTL_MS - 1000,
    );
  });

  test("group channel uses the 30-day group TTL", async () => {
    const { me } = makeMe();
    await sendConnectionRequest(me as any, COUNTERPART, {
      channel: "group",
      requestChannel: "group",
    });
    const mintOpts = mintSpy.mock.calls[0][3] as { expiresAt: Date };
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(mintOpts.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + thirtyDays - 60_000,
    );
  });
});
