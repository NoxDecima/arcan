import { describe, test, expect, beforeEach } from "vitest";
import "@/index.css";

describe("theme shim", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });

  test("data-theme=\"dark\" resolves --background to the dark HSL value", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const v = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    expect(v).toBe("222.2 84% 4.9%");
  });

  test("data-theme=\"light\" (or no attr) resolves --background to the light HSL value", () => {
    document.documentElement.setAttribute("data-theme", "light");
    const v = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    expect(v).toBe("0 0% 100%");
  });
});
