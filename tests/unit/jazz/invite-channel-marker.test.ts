import { describe, test, expect } from "vitest";
import { withQrChannelMarker, readInviteChannel } from "@/jazz/invitations";

describe("withQrChannelMarker", () => {
  test("inserts ?via=qr before the hash fragment", () => {
    expect(withQrChannelMarker("https://host/invite#abc")).toBe(
      "https://host/invite?via=qr#abc",
    );
  });
  test("appends ?via=qr when there is no fragment", () => {
    expect(withQrChannelMarker("https://host/invite")).toBe(
      "https://host/invite?via=qr",
    );
  });
  test("uses & when a query string already exists", () => {
    expect(withQrChannelMarker("https://host/invite?x=1#abc")).toBe(
      "https://host/invite?x=1&via=qr#abc",
    );
  });
  test("is idempotent", () => {
    const once = withQrChannelMarker("https://host/invite#abc");
    expect(withQrChannelMarker(once)).toBe(once);
  });
});

describe("readInviteChannel", () => {
  test("returns qr when ?via=qr is present", () => {
    expect(readInviteChannel("?via=qr")).toBe("qr");
  });
  test("returns link when via is absent", () => {
    expect(readInviteChannel("")).toBe("link");
    expect(readInviteChannel("?foo=bar")).toBe("link");
  });
  test("returns link for other via values", () => {
    expect(readInviteChannel("?via=link")).toBe("link");
  });
});
