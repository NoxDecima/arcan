import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QRScanner } from "@/qr/scanner";
import { scanQrNative } from "@/platform/qr";

vi.mock("@/platform/qr", () => ({
  nativeQrAvailable: () => true,
  scanQrNative: vi.fn(),
}));

const scanMock = vi.mocked(scanQrNative);

describe("QRScanner native auto-launch (feedback round 3)", () => {
  beforeEach(() => {
    scanMock.mockReset();
  });

  test("launches the native scanner immediately on mount — no button step", async () => {
    scanMock.mockResolvedValue(null);
    render(<QRScanner onUrl={vi.fn()} expectedPathPrefix="/invite" />);
    await waitFor(() => expect(scanMock).toHaveBeenCalledTimes(1));
  });

  test("cancel shows the scan-again fallback and does NOT relaunch in a loop", async () => {
    scanMock.mockResolvedValue(null);
    render(<QRScanner onUrl={vi.fn()} expectedPathPrefix="/invite" />);
    await waitFor(() =>
      expect(screen.getByTestId("qr-native-scan")).toBeTruthy(),
    );
    expect(scanMock).toHaveBeenCalledTimes(1);
  });

  test("scan-again re-invokes the native scanner", async () => {
    scanMock.mockResolvedValue(null);
    render(<QRScanner onUrl={vi.fn()} expectedPathPrefix="/invite" />);
    await waitFor(() =>
      expect(screen.getByTestId("qr-native-scan")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("qr-native-scan"));
    await waitFor(() => expect(scanMock).toHaveBeenCalledTimes(2));
  });

  test("a matching scan fires onUrl", async () => {
    const onUrl = vi.fn();
    scanMock.mockResolvedValue("https://example.com/invite?via=qr#frag");
    render(<QRScanner onUrl={onUrl} expectedPathPrefix="/invite" />);
    await waitFor(() =>
      expect(onUrl).toHaveBeenCalledWith("https://example.com/invite?via=qr#frag"),
    );
  });

  test("a wrong-kind scan shows the mismatch hint plus scan-again", async () => {
    const onUrl = vi.fn();
    scanMock.mockResolvedValue("https://example.com/pair#frag");
    render(<QRScanner onUrl={onUrl} expectedPathPrefix="/invite" />);
    await waitFor(() => expect(screen.getByTestId("qr-mismatch")).toBeTruthy());
    expect(onUrl).not.toHaveBeenCalled();
    expect(screen.getByTestId("qr-native-scan")).toBeTruthy();
  });
});
