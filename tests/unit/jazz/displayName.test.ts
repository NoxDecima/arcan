import { describe, it, expect } from "vitest";
import { resolveDisplayName } from "@/jazz/displayName";

/**
 * resolveDisplayName resolution order:
 *   1. self → "Me" (or me.profile.displayName when available)
 *   2. contactBook displayNameLocal
 *   3. group member profile.name / profile.displayName
 *   4. "Unknown"
 */

function makeMe(myID: string, displayName: string | null, contactBook: any[]) {
  return {
    $jazz: { id: myID },
    profile: displayName ? { displayName } : undefined,
    root: { contactBook },
  };
}

function contact(accountID: string, displayNameLocal: string) {
  return { contactAccountID: accountID, displayNameLocal };
}

function groupMember(accountID: string, name?: string, displayName?: string) {
  const profile: any = {};
  if (name) profile.name = name;
  if (displayName) profile.displayName = displayName;
  return {
    account: {
      $jazz: { id: accountID },
      profile: Object.keys(profile).length ? profile : undefined,
    },
  };
}

function group(members: any[]) {
  return { getDirectMembers: () => members };
}

describe("resolveDisplayName", () => {
  it("returns 'Me' for self when no profile displayName set", () => {
    const me = makeMe("acc_me", null, []);
    expect(resolveDisplayName({ accountID: "acc_me", me })).toBe("Me");
  });

  it("returns profile displayName for self when available", () => {
    const me = makeMe("acc_me", "Alice", []);
    expect(resolveDisplayName({ accountID: "acc_me", me })).toBe("Alice");
  });

  it("returns contactBook displayNameLocal when accountID is in contactBook", () => {
    const me = makeMe("acc_me", "Alice", [contact("acc_bob", "Bob (local)")]);
    expect(resolveDisplayName({ accountID: "acc_bob", me })).toBe("Bob (local)");
  });

  it("prefers contactBook over group profile when both present", () => {
    const me = makeMe("acc_me", "Alice", [contact("acc_bob", "Bob (local)")]);
    const g = group([groupMember("acc_bob", "Bob Smith")]);
    expect(resolveDisplayName({ accountID: "acc_bob", me, group: g })).toBe(
      "Bob (local)",
    );
  });

  it("falls back to group member profile.name when no contactBook entry", () => {
    const me = makeMe("acc_me", "Alice", []);
    const g = group([groupMember("acc_charlie", "Charlie Cohen")]);
    expect(
      resolveDisplayName({ accountID: "acc_charlie", me, group: g }),
    ).toBe("Charlie Cohen");
  });

  it("falls back to group member profile.displayName when no profile.name", () => {
    const me = makeMe("acc_me", "Alice", []);
    const g = group([groupMember("acc_dave", undefined, "Dave D")]);
    expect(resolveDisplayName({ accountID: "acc_dave", me, group: g })).toBe(
      "Dave D",
    );
  });

  it("returns 'Unknown' when no source has the accountID", () => {
    const me = makeMe("acc_me", "Alice", []);
    const g = group([]);
    expect(resolveDisplayName({ accountID: "acc_stranger", me, group: g })).toBe(
      "Unknown",
    );
  });

  it("returns 'Unknown' when group is omitted and contactBook misses", () => {
    const me = makeMe("acc_me", "Alice", []);
    expect(resolveDisplayName({ accountID: "acc_stranger", me })).toBe(
      "Unknown",
    );
  });

  it("tolerates members with no account (defensively)", () => {
    const me = makeMe("acc_me", "Alice", []);
    const g = group([{ account: null }, groupMember("acc_eve", "Eve")]);
    expect(resolveDisplayName({ accountID: "acc_eve", me, group: g })).toBe(
      "Eve",
    );
  });
});
