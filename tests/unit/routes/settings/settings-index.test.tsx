import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ToastProvider } from "@/components/toast";
import { ThemeProvider } from "@/styles/use-theme";
import { AccentProvider } from "@/styles/use-accent";
import { SettingsRoute } from "@/routes/settings";

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    profile: { displayName: "decima", avatar: null },
    root: {
      devices: [],
      invitesIssued: [],
      settings: {
        appearance: { theme: "dark", accent: "tokyo", $jazz: { set: vi.fn() } },
        notifications: { sound: false, browser: false, $jazz: { set: vi.fn() } },
      },
    },
    $jazz: { id: "me-account-id" },
  }),
  useLogOut: () => vi.fn(),
}));
vi.mock("@/auth/pubkey", () => ({
  getAccountPubkeyHex: () => "deadbeef".repeat(8),
}));
vi.mock("@/auth/session", () => ({
  getCurrentSessionFingerprint: () => null,
}));
vi.mock("@/components/safety-number", () => ({
  SafetyNumber: () => <div />,
}));
// useIsDesktop: mock as desktop (true) so PHeader's back button does not render,
// keeping the rendered output simple for these structural assertions.
vi.mock("@/components/use-is-desktop", () => ({
  useIsDesktop: () => true,
}));
// ArcanAccount.subscribe is called by useAccountAvatars (own-avatar resolution).
// Stub with a no-op in unit tests — no Jazz sync context available here.
vi.mock("@/jazz/schema/ArcanAccount", () => ({
  ArcanAccount: { subscribe: () => () => {} },
}));

function renderIndex() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <ToastProvider>
        <ThemeProvider>
          <AccentProvider>
            {/* SettingsRoute is mounted at /settings/* in App, so its internal
                <Route index> only matches when nested under that path. */}
            <Routes>
              <Route path="/settings/*" element={<SettingsRoute />} />
            </Routes>
          </AccentProvider>
        </ThemeProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("settings index scaffold", () => {
  test("renders the account section first and the sign-out card", () => {
    renderIndex();
    expect(screen.getByTestId("settings-me-row")).toBeTruthy();
    expect(screen.getByTestId("sign-out-btn")).toBeTruthy();
  });

  test("account section renders before sign-out in document order", () => {
    renderIndex();
    const me = screen.getByTestId("settings-me-row");
    const out = screen.getByTestId("sign-out-btn");
    // bitmask 4 = DOCUMENT_POSITION_FOLLOWING: out follows me
    expect(me.compareDocumentPosition(out) & 4).toBeTruthy();
  });

  // Wave C: the settings-9-5b-zone marker was a temporary insertion-zone div.
  // It is removed now that all section logic is folded into the SettingsBody
  // container that renders <SettingsScreen>. Test removed accordingly.
});
