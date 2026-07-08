import { describe, test, expect, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { ScanInviteRoute } from "@/routes/contacts/scan";

vi.mock("@/qr/scanner", () => ({
  QRScanner: ({ onUrl, expectedPathPrefix }: any) => (
    <button
      type="button"
      data-testid="fake-scanner"
      data-prefix={expectedPathPrefix}
      onClick={() =>
        onUrl("https://some-other-device.example:5173/invite?via=qr#ZnJhZw")
      }
    >
      fake scanner
    </button>
  ),
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location-probe">
      {location.pathname + location.search + location.hash}
    </div>
  );
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/contacts/scan"]}>
      <Routes>
        <Route path="/contacts/scan" element={<ScanInviteRoute />} />
        <Route path="/invite" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ScanInviteRoute", () => {
  test("scans for /invite URLs (not /pair)", () => {
    // Walkthrough fix (2026-07-08): the add-contact scan button used to open
    // the device-pairing responder, whose scanner only accepts /pair URLs and
    // silently ignored contact-invite QRs.
    renderRoute();
    expect(screen.getByTestId("fake-scanner").getAttribute("data-prefix")).toBe(
      "/invite",
    );
  });

  test("navigates locally, preserving ?via=qr and the fragment but dropping the foreign origin", async () => {
    renderRoute();
    fireEvent.click(screen.getByTestId("fake-scanner"));
    await waitFor(() =>
      expect(screen.getByTestId("location-probe").textContent).toBe(
        "/invite?via=qr#ZnJhZw",
      ),
    );
  });
});
