import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  approveConnectionRequest,
  denyConnectionRequest,
  dismissConnectionRequest,
} from "@/jazz/invitations";

// approveConnectionRequest lazily imports ./handshake for the contact
// upsert — stub it so these tests stay pure action-logic tests.
const upsertContactMock = vi.fn();
vi.mock("@/jazz/handshake", () => ({
  upsertContact: (...args: unknown[]) => upsertContactMock(...args),
}));

function makeRecipient(incomingIDs: string[], dismissedIDs: string[] = []) {
  const deleteSpy = vi.fn();
  const setDismissedSpy = vi.fn();
  const incoming: Record<string, any> = {};
  for (const id of incomingIDs) incoming[id] = { $jazz: { id } };
  (incoming as any).$jazz = { delete: deleteSpy };
  const dismissed: Record<string, any> = {};
  for (const id of dismissedIDs) dismissed[id] = true;
  (dismissed as any).$jazz = { set: setDismissedSpy };
  const recipient = {
    root: {
      incomingConnectionRequests: incoming,
      dismissedRequests: dismissed,
    },
  };
  return { recipient, deleteSpy, setDismissedSpy };
}

// -- FM1 group collapse (Task 7 review): approve/deny act on the entire
// collapsed same-requester group, not just the representative CoValue.

function makeLiveRequest(id: string, requesterAccountID: string) {
  const req: any = { requesterAccountID };
  req.$jazz = { id, set: vi.fn() };
  return req;
}

function makeGroupRecipient(entries: any[]) {
  const deleteSpy = vi.fn();
  const setDismissedSpy = vi.fn();
  const incoming: Record<string, any> = {};
  for (const e of entries) incoming[e.$jazz.id] = e;
  (incoming as any).$jazz = { delete: deleteSpy };
  const dismissed: Record<string, any> = {};
  (dismissed as any).$jazz = { set: setDismissedSpy };
  const recipient = {
    root: { incomingConnectionRequests: incoming, dismissedRequests: dismissed },
  };
  return { recipient, deleteSpy, setDismissedSpy };
}

describe("approveConnectionRequest — same-requester group", () => {
  beforeEach(() => upsertContactMock.mockClear());

  test("stamps approvedAt on every live same-requester dupe (single contact upsert)", async () => {
    const acted = makeLiveRequest("req-a", "bob");
    const dupe = makeLiveRequest("req-b", "bob");
    const other = makeLiveRequest("req-c", "carol");
    const { recipient } = makeGroupRecipient([acted, dupe, other]);

    await approveConnectionRequest(recipient as any, acted);

    expect(acted.$jazz.set).toHaveBeenCalledWith("approvedAt", expect.any(Date));
    expect(dupe.$jazz.set).toHaveBeenCalledWith("approvedAt", expect.any(Date));
    // Other requesters are untouched; the contact write stays one upsert.
    expect(other.$jazz.set).not.toHaveBeenCalled();
    expect(upsertContactMock).toHaveBeenCalledTimes(1);
  });

  test("skips dupes already stamped approved/denied", async () => {
    const acted = makeLiveRequest("req-a", "bob");
    const decided = makeLiveRequest("req-b", "bob");
    decided.deniedAt = new Date();
    const { recipient } = makeGroupRecipient([acted, decided]);

    await approveConnectionRequest(recipient as any, acted);

    expect(decided.$jazz.set).not.toHaveBeenCalled();
  });
});

describe("denyConnectionRequest — same-requester group", () => {
  test("stamps, deletes, and dismisses every live same-requester dupe", async () => {
    const acted = makeLiveRequest("req-a", "bob");
    const dupe = makeLiveRequest("req-b", "bob");
    const other = makeLiveRequest("req-c", "carol");
    const { recipient, deleteSpy, setDismissedSpy } = makeGroupRecipient([
      acted,
      dupe,
      other,
    ]);

    await denyConnectionRequest(recipient as any, acted);

    // Both same-requester requests end stamped denied…
    expect(acted.$jazz.set).toHaveBeenCalledWith("deniedAt", expect.any(Date));
    expect(dupe.$jazz.set).toHaveBeenCalledWith("deniedAt", expect.any(Date));
    // …deleted from the record…
    expect(deleteSpy).toHaveBeenCalledWith("req-a");
    expect(deleteSpy).toHaveBeenCalledWith("req-b");
    expect(deleteSpy).toHaveBeenCalledTimes(2);
    // …and marked dismissed (modal stays muted on any re-drain).
    expect(setDismissedSpy).toHaveBeenCalledWith("req-a", true);
    expect(setDismissedSpy).toHaveBeenCalledWith("req-b", true);
    // Other requesters are untouched.
    expect(other.$jazz.set).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalledWith("req-c");
  });
});

describe("denyConnectionRequest", () => {
  test("deletes the request key from incomingConnectionRequests", async () => {
    const { recipient, deleteSpy } = makeRecipient(["req-1", "req-2"]);
    await denyConnectionRequest(recipient as any, {
      $jazz: { id: "req-1", set: vi.fn() },
    } as any);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith("req-1");
  });

  test("records the ID in dismissedRequests (modal stays muted)", async () => {
    const { recipient, setDismissedSpy } = makeRecipient(["req-1"]);
    await denyConnectionRequest(recipient as any, {
      $jazz: { id: "req-1", set: vi.fn() },
    } as any);
    expect(setDismissedSpy).toHaveBeenCalledWith("req-1", true);
  });

  test("stamps deniedAt on the shared request", async () => {
    const { recipient } = makeRecipient(["req-1"]);
    const setSpy = vi.fn();
    await denyConnectionRequest(recipient as any, {
      $jazz: { id: "req-1", set: setSpy },
    } as any);
    expect(setSpy).toHaveBeenCalledWith("deniedAt", expect.any(Date));
  });

  test("does not re-stamp deniedAt when already set", async () => {
    const { recipient } = makeRecipient(["req-1"]);
    const setSpy = vi.fn();
    await denyConnectionRequest(recipient as any, {
      deniedAt: new Date(),
      $jazz: { id: "req-1", set: setSpy },
    } as any);
    expect(setSpy).not.toHaveBeenCalled();
  });
});

describe("dismissConnectionRequest", () => {
  test("only records the ID — does NOT touch incomingConnectionRequests", async () => {
    const { recipient, deleteSpy, setDismissedSpy } = makeRecipient(["req-1"]);
    await dismissConnectionRequest(recipient as any, {
      $jazz: { id: "req-1" },
    } as any);
    expect(setDismissedSpy).toHaveBeenCalledWith("req-1", true);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
