import { describe, test, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAccent, AccentProvider, ACCENT_KEYS } from "@/styles/use-accent";

describe("useAccent", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-accent");
    document.documentElement.setAttribute("data-accent", "tokyo");
  });

  test("ACCENT_KEYS exposes all six accents", () => {
    expect(ACCENT_KEYS).toEqual(["tokyo", "violet", "teal", "lime", "amber", "rose"]);
  });

  test("returns current accent from document attribute", () => {
    const { result } = renderHook(() => useAccent(), { wrapper: AccentProvider });
    expect(result.current.accent).toBe("tokyo");
  });

  test("setAccent updates the document attribute and the value", () => {
    const { result } = renderHook(() => useAccent(), { wrapper: AccentProvider });
    act(() => result.current.setAccent("violet"));
    expect(document.documentElement.getAttribute("data-accent")).toBe("violet");
    expect(result.current.accent).toBe("violet");
  });

  test("rejects unknown accent values at runtime", () => {
    const { result } = renderHook(() => useAccent(), { wrapper: AccentProvider });
    // @ts-expect-error — intentionally invalid value to test runtime guard
    expect(() => result.current.setAccent("blurple")).toThrow(/unknown accent/i);
  });
});
