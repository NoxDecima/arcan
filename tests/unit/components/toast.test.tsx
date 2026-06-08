import { describe, test, expect, beforeEach, vi } from "vitest";
import { render, screen, act, renderHook } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/toast";
import type { ReactNode } from "react";

function Wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  test("toast() renders a toast then dismisses after the default 2200ms", () => {
    const { result } = renderHook(() => useToast(), { wrapper: Wrapper });
    act(() => result.current({ icon: "copy", text: "invite link copied", tone: "accent" }));
    expect(screen.getByText("invite link copied")).toBeTruthy();
    act(() => vi.advanceTimersByTime(2300));
    expect(screen.queryByText("invite link copied")).toBeNull();
  });

  test("variant tone gets applied as a data attribute", () => {
    const { result } = renderHook(() => useToast(), { wrapper: Wrapper });
    act(() => result.current({ icon: "bell", text: "settings saved", tone: "success" }));
    const el = screen.getByText("settings saved").closest("[data-toast-tone]");
    expect(el?.getAttribute("data-toast-tone")).toBe("success");
  });
});
