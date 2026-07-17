import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageRow } from "@/ui/kit/bubble";

describe("MessageRow timestamp caption (feedback round 4)", () => {
  test("time renders below the bubble, not inside the body row", () => {
    render(
      <MessageRow
        m={{ who: "me", text: "shipping it tonight", time: "9:22" }}
        w={220}
        bodyTestId="bubble-body"
        timeTestId="bubble-time"
      />,
    );
    const caption = screen.getByTestId("bubble-time");
    expect(caption.textContent).toBe("9:22");
    // The caption is a sibling of the bubble inside the column, not a child
    // of the body span's parent bubble div.
    const body = screen.getByTestId("bubble-body");
    expect(body.parentElement!.contains(caption)).toBe(false);
  });

  test("edited messages append the marker to the caption", () => {
    render(
      <MessageRow
        m={{ who: "me", text: "hi", time: "9:22", edited: true }}
        w={220}
        timeTestId="bubble-time"
      />,
    );
    expect(screen.getByTestId("bubble-time").textContent).toBe("9:22 · edited");
  });

  test("their messages keep a left-aligned caption; own are right-aligned", () => {
    const { rerender } = render(
      <MessageRow
        m={{ who: "them", ini: "AK", text: "hello", time: "9:18" }}
        w={220}
        timeTestId="bubble-time"
      />,
    );
    expect(screen.getByTestId("bubble-time").className).toContain("text-left");
    rerender(
      <MessageRow
        m={{ who: "me", text: "hello", time: "9:18" }}
        w={220}
        timeTestId="bubble-time"
      />,
    );
    expect(screen.getByTestId("bubble-time").className).toContain("text-right");
  });

  test("no caption renders when the message has no time and is not edited", () => {
    render(
      <MessageRow m={{ who: "me", text: "hi" }} w={220} timeTestId="bubble-time" />,
    );
    expect(screen.queryByTestId("bubble-time")).toBeNull();
  });
});
