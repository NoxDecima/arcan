import { render, screen } from "@testing-library/react";
import { SafetyNumber } from "@/components/safety-number";
import { formatSafetyNumber } from "@/auth/fingerprint";

const SAMPLE_HEX = "a".repeat(64);

describe("SafetyNumber", () => {
  it("renders with data-testid safety-number", () => {
    render(<SafetyNumber fingerprintHex={SAMPLE_HEX} />);
    expect(screen.getByTestId("safety-number")).toBeInTheDocument();
  });

  it("displays the formatted safety number for a known input", () => {
    const expected = formatSafetyNumber(SAMPLE_HEX);
    render(<SafetyNumber fingerprintHex={SAMPLE_HEX} />);
    expect(screen.getByTestId("safety-number")).toHaveTextContent(expected);
  });

  it("renders as a <code> element", () => {
    render(<SafetyNumber fingerprintHex={SAMPLE_HEX} />);
    const el = screen.getByTestId("safety-number");
    expect(el.tagName.toLowerCase()).toBe("code");
  });
});
