import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The Jazz hooks the step imports require a provider; stub them so the
// component renders standalone. We only exercise the avatar-picker UI here.
vi.mock("@/jazz/createAccountFromSeed", () => ({
  useCreateAccountWithSeed: () => vi.fn(async () => ({ accountID: "co_zTEST" })),
  useSetDisplayNameOnMe: () => vi.fn(async () => {}),
}));
vi.mock("@/auth/flows", () => ({ signUp: vi.fn() }));

import { ProfileStep } from "@/routes/onboarding/profile-step";

const credentials = { email: "a@b.dev", password: "correcthorsebattery1!" };
const recoveryCode = "x".repeat(10);

beforeEach(() => {
  // jsdom lacks createObjectURL; the component uses it for the preview.
  (URL as any).createObjectURL = vi.fn(() => "blob:preview");
  (URL as any).revokeObjectURL = vi.fn();
});

describe("ProfileStep avatar picker", () => {
  test("clicking the camera badge opens the hidden file input", () => {
    render(
      <MemoryRouter>
        <ProfileStep
          credentials={credentials}
          recoveryCode={recoveryCode}
          onBack={vi.fn()}
        />
      </MemoryRouter>,
    );
    const input = screen.getByTestId(
      "onboarding-avatar-input",
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    fireEvent.click(screen.getByTestId("onboarding-avatar-change"));
    expect(clickSpy).toHaveBeenCalled();
  });

  test("selecting an image previews it on the avatar tile", async () => {
    render(
      <MemoryRouter>
        <ProfileStep
          credentials={credentials}
          recoveryCode={recoveryCode}
          onBack={vi.fn()}
        />
      </MemoryRouter>,
    );
    const input = screen.getByTestId(
      "onboarding-avatar-input",
    ) as HTMLInputElement;
    const file = new File(["x"], "me.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      const img = screen.getByTestId("onboarding-avatar-preview");
      expect(img.getAttribute("src")).toBe("blob:preview");
    });
  });
});
