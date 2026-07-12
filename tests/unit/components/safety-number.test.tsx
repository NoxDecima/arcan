import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { SafetyNumber } from "@/components/safety-number";
import { formatSafetyNumber } from "@/auth/fingerprint";
import { ToastProvider } from "@/components/toast";

const SAMPLE_HEX = "a".repeat(64);

describe("SafetyNumber", () => {
  it("renders with data-testid safety-number", () => {
    render(
      <ToastProvider>
        <SafetyNumber fingerprintHex={SAMPLE_HEX} />
      </ToastProvider>,
    );
    expect(screen.getByTestId("safety-number")).toBeInTheDocument();
  });

  it("displays the formatted safety number for a known input", () => {
    const expected = formatSafetyNumber(SAMPLE_HEX);
    render(
      <ToastProvider>
        <SafetyNumber fingerprintHex={SAMPLE_HEX} />
      </ToastProvider>,
    );
    expect(screen.getByTestId("safety-number")).toHaveTextContent(expected);
  });

  it("renders as a <code> element", () => {
    render(
      <ToastProvider>
        <SafetyNumber fingerprintHex={SAMPLE_HEX} />
      </ToastProvider>,
    );
    const el = screen.getByTestId("safety-number");
    expect(el.tagName.toLowerCase()).toBe("code");
  });

  it("copies the formatted code and confirms via toast", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <ToastProvider>
        <SafetyNumber fingerprintHex={SAMPLE_HEX} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByTestId("safety-number-copy"));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(formatSafetyNumber(SAMPLE_HEX)),
    );
  });
});
