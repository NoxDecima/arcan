import { describe, test, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@/styles/use-theme";
import { AccentProvider } from "@/styles/use-accent";
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
    <ThemeProvider>
      <AccentProvider>{children}</AccentProvider>
    </ThemeProvider>
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
});
