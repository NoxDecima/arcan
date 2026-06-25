import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { BackupDisplayStep } from "@/routes/onboarding/backup-display-step";

const PHRASE = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(" ");

describe("BackupDisplayStep spacing", () => {
  test("renders a roomy variant marker for the recovery-code step", () => {
    const { container } = render(
      <BackupDisplayStep
        phrase={PHRASE}
        onBack={() => {}}
        onContinue={() => {}}
      />,
    );
    // The step opts into extra vertical breathing room (1.3/1.4/1.5-A) via a
    // data hook so the spacing intent is testable and not silently dropped.
    const roomy = container.querySelector('[data-roomy="recovery"]');
    expect(roomy).not.toBeNull();
  });
});
