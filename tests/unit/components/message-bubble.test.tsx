import { describe, test, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/jazz/avatarResolver", () => ({
  resolveAvatarFileBlob: () => undefined,
  useRemoteAvatar: () => undefined,
}));

import { MessageBubble } from "@/components/message-bubble";

const ME = { $jazz: { id: "co_zMe" } };
const baseMsg = (over: Record<string, unknown> = {}) => ({
  body: "hello there",
  sentAt: new Date("2026-06-23T09:10:00"),
  deleted: false,
  edited: false,
  attachments: [],
  ...over,
});

describe("MessageBubble styling", () => {
  test("own bubble uses accent fill + on-accent text", () => {
    const { getByTestId } = render(
      <MessageBubble
        message={baseMsg()}
        authorAccountID="co_zMe"
        authorDisplayName="decima"
        isMine
        me={ME}
      />,
    );
    const bubble = getByTestId("bubble-body");
    expect(bubble.className).toContain("bg-arcan-accent");
    expect(bubble.className).toContain("text-on-accent");
  });

  test("other bubble uses panel + text", () => {
    const { getByTestId } = render(
      <MessageBubble
        message={baseMsg()}
        authorAccountID="co_zBob"
        authorDisplayName="bob"
        isMine={false}
        me={ME}
      />,
    );
    const bubble = getByTestId("bubble-body");
    expect(bubble.className).toContain("bg-panel");
    expect(bubble.className).toContain("text-text");
    expect(bubble.className).not.toContain("bg-arcan-accent");
  });

  test("timestamp renders inline inside the bubble at 8.5px mono", () => {
    const { getByTestId } = render(
      <MessageBubble
        message={baseMsg()}
        authorAccountID="co_zMe"
        authorDisplayName="decima"
        isMine
        me={ME}
      />,
    );
    const time = getByTestId("bubble-time");
    expect(time.className).toContain("text-[8.5px]");
    expect(time.className).toContain("font-mono");
    // inline: the timestamp is a descendant of the bubble body element
    expect(getByTestId("bubble-body").contains(time)).toBe(true);
  });
});
