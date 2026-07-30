import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatComposer } from "@/ui/screens/chat-composer";

function renderComposer(overrides: Partial<Parameters<typeof ChatComposer>[0]> = {}) {
  const onSend = vi.fn();
  const onChange = vi.fn();
  render(
    <ChatComposer
      value="hello"
      onChange={onChange}
      onSend={onSend}
      placeholder="message"
      {...overrides}
    />,
  );
  return { onSend, onChange, input: screen.getByTestId("composer-input") };
}

describe("ChatComposer — Enter behaviour", () => {
  it("desktop (default): Enter sends", () => {
    const { onSend } = renderComposer();
    fireEvent.keyDown(screen.getByTestId("composer-input"), { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("desktop: Shift+Enter does NOT send (inserts a newline)", () => {
    const { onSend } = renderComposer();
    fireEvent.keyDown(screen.getByTestId("composer-input"), {
      key: "Enter",
      shiftKey: true,
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("mobile (softEnterNewline): Enter does NOT send — it inserts a newline", () => {
    const { onSend } = renderComposer({ softEnterNewline: true });
    fireEvent.keyDown(screen.getByTestId("composer-input"), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("mobile: the send button still sends", () => {
    const { onSend } = renderComposer({ softEnterNewline: true });
    fireEvent.click(screen.getByTestId("composer-send-btn"));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("mobile: keyboard is hinted to show a return key (enterKeyHint=enter)", () => {
    const { input } = renderComposer({ softEnterNewline: true });
    expect(input).toHaveAttribute("enterkeyhint", "enter");
  });

  it("desktop: keyboard hint is send (enterKeyHint=send)", () => {
    const { input } = renderComposer();
    expect(input).toHaveAttribute("enterkeyhint", "send");
  });
});
