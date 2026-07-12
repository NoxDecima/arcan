import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The Jazz hooks the step imports require a provider; stub them so the
// component renders standalone. The inner fns resolve real values so the
// deferred-upload describe block's createJazzAccount callback can await them.
vi.mock("@/jazz/createAccountFromSeed", () => ({
  useCreateAccountWithSeed: () => vi.fn(async () => ({ accountID: "co_zTEST" })),
  useSetDisplayNameOnMe: () => vi.fn(async () => {}),
}));
vi.mock("@/auth/flows", () => ({ signUp: vi.fn() }));
vi.mock("@/jazz/avatar", async (orig) => {
  const actual = (await orig()) as typeof import("@/jazz/avatar");
  return {
    ...actual,
    setProfileAvatar: vi.fn(async () => {}),
    resizeImageToSquare: vi.fn(async (f: File) => f),
  };
});
vi.mock("@/auth/recovery-code", () => ({
  decodeRecoveryCode: () => new Uint8Array(32),
}));
// handleFinish's deferred-upload path dynamically imports ArcanAccount and
// calls getMe().$jazz.ensureLoaded() to reach the just-created account. There
// is no live Jazz node here, so stub getMe() to resolve a minimal `me` whose
// profile the (mocked) setProfileAvatar can be handed.
vi.mock("@/jazz/schema/ArcanAccount", () => ({
  ArcanAccount: {
    getMe: () => ({
      $jazz: {
        ensureLoaded: async () => ({ profile: {} }),
      },
    }),
  },
}));

import { ProfileStep } from "@/routes/onboarding/profile-step";
import * as flows from "@/auth/flows";
import * as avatar from "@/jazz/avatar";

const credentials = { email: "a@b.dev", password: "correcthorsebattery1!" };
const recoveryCode = "x".repeat(10);

beforeEach(() => {
  // jsdom lacks createObjectURL; the component uses it for the preview.
  (URL as any).createObjectURL = vi.fn(() => "blob:preview");
  (URL as any).revokeObjectURL = vi.fn();
});

describe("ProfileStep avatar picker", () => {
  test("clicking the camera badge opens the hidden file input", async () => {
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
    // handleAvatarPick is async (awaits pickFilesNative → null on web,
    // then falls through to the DOM input click); waitFor gives the
    // microtask queue time to drain.
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
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

describe("ProfileStep deferred avatar upload", () => {
  test("uploads the picked avatar after the Jazz account is created", async () => {
    // signUp invokes its createJazzAccount callback, then resolves.
    const signUpSpy = vi
      .spyOn(flows, "signUp")
      .mockImplementation(async (args: any) => {
        await args.createJazzAccount(args.seed, args.displayName);
      });

    render(
      <MemoryRouter>
        <ProfileStep
          credentials={credentials}
          recoveryCode={recoveryCode}
          onBack={vi.fn()}
        />
      </MemoryRouter>,
    );

    // Pick an avatar.
    const input = screen.getByTestId(
      "onboarding-avatar-input",
    ) as HTMLInputElement;
    const file = new File(["x"], "me.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    // Fill the name and finish.
    fireEvent.change(screen.getByTestId("display-name-input"), {
      target: { value: "Alice" },
    });
    fireEvent.click(screen.getByTestId("finish-onboarding-btn"));

    await waitFor(() => {
      expect(signUpSpy).toHaveBeenCalled();
      expect(avatar.resizeImageToSquare).toHaveBeenCalled();
      expect(avatar.setProfileAvatar).toHaveBeenCalled();
    });
  });
});
