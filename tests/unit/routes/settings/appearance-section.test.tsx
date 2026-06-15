import { describe, test, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { ThemeProvider } from "@/styles/use-theme";
import { AccentProvider } from "@/styles/use-accent";
import { ToastProvider } from "@/components/toast";
import { AppearanceSection } from "@/routes/settings/appearance-section";

vi.mock("jazz-tools/react", () => ({
  useAccount: () => ({
    $isLoaded: true,
    root: {
      settings: {
        appearance: {
          theme: "dark",
          accent: "tokyo",
          $jazz: { set: vi.fn() },
        },
      },
    },
  }),
}));

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ThemeProvider>
        <AccentProvider>{children}</AccentProvider>
      </ThemeProvider>
    </ToastProvider>
  );
}

describe("AppearanceSection", () => {
  test("clicking 'light' updates the document attribute", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { getByTestId } = render(
      <Wrap>
        <AppearanceSection />
      </Wrap>
    );
    fireEvent.click(getByTestId("theme-light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  test("clicking an accent swatch updates the document attribute", () => {
    document.documentElement.setAttribute("data-accent", "tokyo");
    const { getByTestId } = render(
      <Wrap>
        <AppearanceSection />
      </Wrap>
    );
    fireEvent.click(getByTestId("accent-violet"));
    expect(document.documentElement.getAttribute("data-accent")).toBe("violet");
  });

  test("clicking 'light' fires an 'appearance updated' toast", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { getByTestId } = render(
      <Wrap>
        <AppearanceSection />
      </Wrap>
    );
    fireEvent.click(getByTestId("theme-light"));
    expect(screen.getByText("appearance updated")).toBeTruthy();
  });

  test("clicking an accent swatch fires an 'appearance updated' toast", () => {
    document.documentElement.setAttribute("data-accent", "tokyo");
    const { getByTestId } = render(
      <Wrap>
        <AppearanceSection />
      </Wrap>
    );
    fireEvent.click(getByTestId("accent-violet"));
    expect(screen.getByText("appearance updated")).toBeTruthy();
  });
});
