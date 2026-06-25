import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "@/components/toast";
import { NotificationsSection } from "@/routes/settings/notifications-section";

let prefsState: { sound: boolean; browser: boolean };
const setSpy = vi.fn();

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    root: {
      settings: {
        notifications: new Proxy(prefsState as any, {
          get(target, prop) {
            if (prop === "$jazz") {
              return {
                set: (k: keyof typeof prefsState, v: boolean) => {
                  setSpy(k, v);
                  (target as any)[k] = v;
                },
              };
            }
            return (target as any)[prop];
          },
        }),
      },
    },
  }),
}));

function Wrap({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe("NotificationsSection", () => {
  beforeEach(() => {
    prefsState = { sound: false, browser: false };
    setSpy.mockClear();
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: Object.assign(
        function NotificationCtor() {},
        {
          permission: "default" as NotificationPermission,
          requestPermission: vi.fn(async () => "granted" as NotificationPermission),
        },
      ),
    });
  });

  test("toggling sound fires a 'notifications updated' toast", () => {
    render(
      <Wrap>
        <NotificationsSection />
      </Wrap>
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "sound on new messages" }),
    );
    expect(setSpy).toHaveBeenCalledWith("sound", true);
    expect(screen.getByText("notifications updated")).toBeTruthy();
  });

  test("enabling browser notifications fires a 'notifications updated' toast on grant", async () => {
    render(
      <Wrap>
        <NotificationsSection />
      </Wrap>
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "browser notifications" }),
    );
    await waitFor(() => {
      expect(setSpy).toHaveBeenCalledWith("browser", true);
    });
    expect(screen.getByText("notifications updated")).toBeTruthy();
  });

  test("disabling browser notifications fires a 'notifications updated' toast", () => {
    prefsState = { sound: false, browser: true };
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: Object.assign(function NotificationCtor() {}, {
        permission: "granted" as NotificationPermission,
        requestPermission: vi.fn(async () => "granted" as NotificationPermission),
      }),
    });
    render(
      <Wrap>
        <NotificationsSection />
      </Wrap>
    );
    // browser is effective-on (prefs.browser=true + permission granted), so the
    // single browser slider toggles OFF on click.
    fireEvent.click(
      screen.getByRole("switch", { name: "browser notifications" }),
    );
    expect(setSpy).toHaveBeenCalledWith("browser", false);
    expect(screen.getByText("notifications updated")).toBeTruthy();
  });
});
