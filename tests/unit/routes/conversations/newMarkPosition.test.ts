import { describe, test, expect } from "vitest";
import {
  findNewMarkIndex,
  type DividerTimelineItem,
} from "@/routes/conversations/newMarkPosition";

const ME = "co_zMe";
const OTHER = "co_zOther";

function msg(sortAt: number, author: string): DividerTimelineItem {
  return { kind: "message", sortAt, authorAccountID: author };
}
function event(sortAt: number): DividerTimelineItem {
  return { kind: "event", sortAt };
}

describe("findNewMarkIndex", () => {
  test("returns -1 when no items qualify", () => {
    // Anchor in the future → nothing is past it.
    const items: DividerTimelineItem[] = [
      msg(10, OTHER),
      msg(20, OTHER),
    ];
    expect(findNewMarkIndex(items, 100, ME)).toBe(-1);
  });

  test("returns -1 when all incoming messages are at or before anchor", () => {
    const items: DividerTimelineItem[] = [
      msg(10, OTHER),
      msg(20, OTHER),
      msg(30, OTHER),
    ];
    expect(findNewMarkIndex(items, 30, ME)).toBe(-1);
  });

  test("inserts at the first incoming message past anchor", () => {
    const items: DividerTimelineItem[] = [
      msg(10, OTHER), // read
      msg(20, OTHER), // read
      msg(30, OTHER), // first unread
      msg(40, OTHER),
    ];
    expect(findNewMarkIndex(items, 20, ME)).toBe(2);
  });

  test("skips self-authored messages even when past anchor", () => {
    const items: DividerTimelineItem[] = [
      msg(10, OTHER), // read
      msg(20, ME), // self, skipped
      msg(30, OTHER), // first unread incoming
    ];
    expect(findNewMarkIndex(items, 15, ME)).toBe(2);
  });

  test("skips SystemEvents even when past anchor", () => {
    const items: DividerTimelineItem[] = [
      msg(10, OTHER),
      event(20),
      msg(30, OTHER),
    ];
    expect(findNewMarkIndex(items, 15, ME)).toBe(2);
  });

  test("places divider at top when all incoming messages are unread", () => {
    // anchor=0 means lastReadAt was never set; first qualifying item wins.
    const items: DividerTimelineItem[] = [
      msg(10, OTHER),
      msg(20, OTHER),
    ];
    expect(findNewMarkIndex(items, 0, ME)).toBe(0);
  });

  test("treats a null anchor as 0 (all-unread case)", () => {
    const items: DividerTimelineItem[] = [
      msg(10, OTHER),
      msg(20, OTHER),
    ];
    expect(findNewMarkIndex(items, null, ME)).toBe(0);
  });

  test("handles a self-message at the head before any incoming unread", () => {
    const items: DividerTimelineItem[] = [
      msg(5, ME), // self at the head — skipped
      msg(10, OTHER), // first incoming after anchor
    ];
    expect(findNewMarkIndex(items, 0, ME)).toBe(1);
  });

  test("handles empty timeline", () => {
    expect(findNewMarkIndex([], 10, ME)).toBe(-1);
  });
});
