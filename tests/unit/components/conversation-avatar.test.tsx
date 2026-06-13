import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  ConversationAvatar,
  hueFromId,
  initialsFromTitle,
} from "@/components/conversation-avatar";

describe("hueFromId", () => {
  test("is deterministic for the same id", () => {
    expect(hueFromId("co_zAbcDef")).toBe(hueFromId("co_zAbcDef"));
  });

  test("returns a hue in [0, 360)", () => {
    for (const id of ["co_z1", "co_z2", "co_zMnopQrstuv", ""]) {
      const h = hueFromId(id);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  test("differs across different ids (likely)", () => {
    expect(hueFromId("co_zAlpha")).not.toBe(hueFromId("co_zBeta"));
  });
});

describe("initialsFromTitle", () => {
  test("single-word: first letter uppercased", () => {
    expect(initialsFromTitle("trip")).toBe("T");
  });
  test("two-word: two initials concatenated", () => {
    expect(initialsFromTitle("trip planning")).toBe("TP");
  });
  test("three-word: only first two initials", () => {
    expect(initialsFromTitle("alpha beta gamma")).toBe("AB");
  });
  test("empty title → '?'", () => {
    expect(initialsFromTitle("")).toBe("?");
    expect(initialsFromTitle("   ")).toBe("?");
  });
});

describe("ConversationAvatar render", () => {
  test("renders the monogram when no icon is set", () => {
    const { getByTestId } = render(
      <ConversationAvatar
        conversationId="co_zAbcDef"
        title="Trip Planning"
        size={36}
      />,
    );
    const el = getByTestId("conversation-avatar");
    expect(el.textContent).toBe("TP");
  });

  test("applies a deterministic background color when no icon", () => {
    const { getByTestId, rerender } = render(
      <ConversationAvatar
        conversationId="co_zStable"
        title="Group"
      />,
    );
    const el = getByTestId("conversation-avatar") as HTMLElement;
    const firstBg = el.style.backgroundColor;
    // backgroundColor is non-empty (jsdom serializes hsl() as rgb()).
    expect(firstBg.length).toBeGreaterThan(0);

    // Re-render with the same id → identical color.
    rerender(
      <ConversationAvatar conversationId="co_zStable" title="Group" />,
    );
    expect(el.style.backgroundColor).toBe(firstBg);
  });
});
