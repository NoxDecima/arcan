import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTabTitleBadge } from "@/hooks/useTabTitleBadge";

describe("useTabTitleBadge", () => {
  let originalTitle: string;

  beforeEach(() => {
    originalTitle = document.title;
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });

  afterEach(() => {
    document.title = originalTitle;
  });

  function setHidden(hidden: boolean) {
    Object.defineProperty(document, "hidden", { configurable: true, value: hidden });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  test("title is plain when not hidden, regardless of unread", () => {
    setHidden(false);
    renderHook(() => useTabTitleBadge(5, "Jazz Messanger"));
    expect(document.title).toBe("Jazz Messanger");
  });

  test("title prefixed when hidden + unread > 0", () => {
    setHidden(true);
    renderHook(() => useTabTitleBadge(3, "Jazz Messanger"));
    expect(document.title).toBe("(3) Jazz Messanger");
  });

  test("title stays plain when hidden + unread = 0", () => {
    setHidden(true);
    renderHook(() => useTabTitleBadge(0, "Jazz Messanger"));
    expect(document.title).toBe("Jazz Messanger");
  });

  test("99+ for very large counts", () => {
    setHidden(true);
    renderHook(() => useTabTitleBadge(150, "Jazz Messanger"));
    expect(document.title).toBe("(99+) Jazz Messanger");
  });

  test("visibilitychange re-syncs the title", () => {
    setHidden(false);
    renderHook(() => useTabTitleBadge(4, "Jazz Messanger"));
    expect(document.title).toBe("Jazz Messanger");
    setHidden(true);
    expect(document.title).toBe("(4) Jazz Messanger");
    setHidden(false);
    expect(document.title).toBe("Jazz Messanger");
  });

  test("cleanup restores plain title on unmount", () => {
    setHidden(true);
    const { unmount } = renderHook(() => useTabTitleBadge(5, "Jazz Messanger"));
    expect(document.title).toBe("(5) Jazz Messanger");
    unmount();
    expect(document.title).toBe("Jazz Messanger");
  });
});
