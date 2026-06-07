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
    renderHook(() => useTabTitleBadge(5, "Arcan"));
    expect(document.title).toBe("Arcan");
  });

  test("title prefixed when hidden + unread > 0", () => {
    setHidden(true);
    renderHook(() => useTabTitleBadge(3, "Arcan"));
    expect(document.title).toBe("(3) Arcan");
  });

  test("title stays plain when hidden + unread = 0", () => {
    setHidden(true);
    renderHook(() => useTabTitleBadge(0, "Arcan"));
    expect(document.title).toBe("Arcan");
  });

  test("99+ for very large counts", () => {
    setHidden(true);
    renderHook(() => useTabTitleBadge(150, "Arcan"));
    expect(document.title).toBe("(99+) Arcan");
  });

  test("visibilitychange re-syncs the title", () => {
    setHidden(false);
    renderHook(() => useTabTitleBadge(4, "Arcan"));
    expect(document.title).toBe("Arcan");
    setHidden(true);
    expect(document.title).toBe("(4) Arcan");
    setHidden(false);
    expect(document.title).toBe("Arcan");
  });

  test("cleanup restores plain title on unmount", () => {
    setHidden(true);
    const { unmount } = renderHook(() => useTabTitleBadge(5, "Arcan"));
    expect(document.title).toBe("(5) Arcan");
    unmount();
    expect(document.title).toBe("Arcan");
  });
});
