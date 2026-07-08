import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { QRScanner } from "@/qr/scanner";

let scanCallback: ((result: { data: string }) => void) | undefined;

vi.mock("qr-scanner", () => ({
  default: class FakeQrScanner {
    constructor(_video: unknown, cb: (r: { data: string }) => void) {
      scanCallback = cb;
    }
    start = vi.fn(async () => undefined);
    stop = vi.fn();
    destroy = vi.fn();
  },
}));

describe("QRScanner mismatch feedback", () => {
  beforeEach(() => {
    scanCallback = undefined;
  });

  test("a detected code that doesn't match the expected prefix shows a hint instead of silently dropping", async () => {
    // Walkthrough fix (2026-07-08): scanning a valid-but-wrong QR (e.g. an
    // /invite code in the /pair scanner) used to give zero feedback — the
    // camera kept running and the user saw "nothing happens".
    const onUrl = vi.fn();
    render(<QRScanner onUrl={onUrl} expectedPathPrefix="/invite" />);
    await waitFor(() => expect(scanCallback).toBeDefined());

    act(() => scanCallback!({ data: "https://example.com/pair#abc" }));

    expect(onUrl).not.toHaveBeenCalled();
    expect(screen.getByTestId("qr-mismatch")).toBeTruthy();
  });

  test("a matching code fires onUrl and clears the hint", async () => {
    const onUrl = vi.fn();
    render(<QRScanner onUrl={onUrl} expectedPathPrefix="/invite" />);
    await waitFor(() => expect(scanCallback).toBeDefined());

    act(() => scanCallback!({ data: "https://example.com/pair#abc" }));
    act(() =>
      scanCallback!({ data: "https://example.com/invite?via=qr#ZnJhZw" }),
    );

    expect(onUrl).toHaveBeenCalledWith("https://example.com/invite?via=qr#ZnJhZw");
    expect(screen.queryByTestId("qr-mismatch")).toBeNull();
  });
});
