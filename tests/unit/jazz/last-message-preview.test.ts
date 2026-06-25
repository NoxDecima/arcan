import { describe, it, expect } from "vitest";
import { getLastMessagePreview } from "@/jazz/notifications";

// Minimal message stubs — the helper only reads body / deleted / attachments.
const msg = (over: Record<string, unknown>) => ({
  body: "",
  deleted: false,
  attachments: [],
  ...over,
});

describe("getLastMessagePreview", () => {
  it("returns the last message body", () => {
    const conv = { messages: [msg({ body: "hello" }), msg({ body: "latest" })] };
    expect(getLastMessagePreview(conv)).toBe("latest");
  });

  it("returns empty string when there are no messages", () => {
    expect(getLastMessagePreview({ messages: [] })).toBe("");
    expect(getLastMessagePreview({})).toBe("");
    expect(getLastMessagePreview(null)).toBe("");
  });

  it("shows a placeholder for a deleted last message", () => {
    const conv = { messages: [msg({ body: "", deleted: true })] };
    expect(getLastMessagePreview(conv)).toBe("message deleted");
  });

  it("shows a photo placeholder for an attachment-only last message", () => {
    const conv = { messages: [msg({ body: "", attachments: [{}] })] };
    expect(getLastMessagePreview(conv)).toBe("photo");
  });

  it("prefers the body over the attachment placeholder when both present", () => {
    const conv = { messages: [msg({ body: "caption", attachments: [{}] })] };
    expect(getLastMessagePreview(conv)).toBe("caption");
  });

  it("collapses internal whitespace / newlines to a single space", () => {
    const conv = { messages: [msg({ body: "line one\n\nline two" })] };
    expect(getLastMessagePreview(conv)).toBe("line one line two");
  });
});
