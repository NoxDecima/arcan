import { describe, it, expect } from "vitest";
import { parseInvitationURL } from "@/jazz/invitations";

// Helper: base64url-encode a Uint8Array
function toB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("parseInvitationURL", () => {
  it("round-trips with a constructed URL (pipe-delimited fragment)", () => {
    // Build a URL the same way createInvitation does:
    // /invite#<b64url(inviteGroupID|inviteAgentSecret)>
    const inviteGroupID = "co_zTestGroupID";
    const inviteAgentSecret = "inviteSecret_zTestAgentSecret";
    const fragment = toB64url(
      new TextEncoder().encode(`${inviteGroupID}|${inviteAgentSecret}`),
    );
    const url = `https://example.test/invite#${fragment}`;

    const parsed = parseInvitationURL(url);
    expect(parsed.inviteGroupID).toBe(inviteGroupID);
    expect(parsed.inviteAgentSecret).toBe(inviteAgentSecret);
  });

  it("throws on a URL that does not contain /invite", () => {
    const fragment = toB64url(new TextEncoder().encode("groupID|secret"));
    expect(() =>
      parseInvitationURL(`https://example.test/pair#${fragment}`),
    ).toThrow(/not an invitation URL/i);
  });

  it("throws on a /invite URL with no fragment", () => {
    expect(() =>
      parseInvitationURL("https://example.test/invite"),
    ).toThrow(/no fragment/i);
  });

  it("throws when fragment has wrong number of parts (only one)", () => {
    const bad = toB64url(new TextEncoder().encode("onlyone"));
    expect(() =>
      parseInvitationURL(`https://example.test/invite#${bad}`),
    ).toThrow();
  });
});
