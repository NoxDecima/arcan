import { describe, test, expect } from "vitest";
import { render } from "@testing-library/react";
import { ConversationAvatar } from "@/components/conversation-avatar";

describe("ConversationAvatar shape", () => {
  test("is rounded-rect not pill", () => {
    const { getByTestId } = render(
      <ConversationAvatar conversationId="co_x" title="Bob" />,
    );
    const el = getByTestId("conversation-avatar");
    expect(el.className).toContain("rounded-avatar");
    expect(el.className).not.toContain("rounded-pill");
  });
});
