import { describe, it, expect } from "vitest";
import { classifyIncomingUrl } from "@/platform/deep-link";

describe("classifyIncomingUrl", () => {
  const current = "https://chat.meteory.eu";

  it("maps a same-origin invite URL to an in-app navigation", () => {
    expect(
      classifyIncomingUrl("https://chat.meteory.eu/invite#frag123", current),
    ).toEqual({ kind: "navigate", to: "/invite#frag123" });
  });

  it("preserves search and hash", () => {
    expect(
      classifyIncomingUrl("https://chat.meteory.eu/pair?step=2#secret", current),
    ).toEqual({ kind: "navigate", to: "/pair?step=2#secret" });
  });

  it("flags a foreign-instance URL for the switch prompt", () => {
    expect(
      classifyIncomingUrl("https://other.example/invite#frag", current),
    ).toEqual({
      kind: "foreign",
      origin: "https://other.example",
      to: "/invite#frag",
      hash: "#frag",
      isInvite: true,
    });
  });

  it("rejects garbage", () => {
    expect(classifyIncomingUrl("not a url", current)).toBeNull();
    expect(classifyIncomingUrl("http://insecure.example/invite", current)).toBeNull();
  });
});
