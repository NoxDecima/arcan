import { describe, test, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNewMessageEvents } from "@/hooks/useNewMessageEvents";

type ConvInput = {
  id: string;
  label: string;
  messageCount: number;
  unread: number;
};

describe("useNewMessageEvents", () => {
  test("first render establishes baseline; callback NOT called", () => {
    const onNewMessage = vi.fn();
    renderHook(() =>
      useNewMessageEvents({
        conversations: [
          { id: "c1", label: "Alice", messageCount: 5, unread: 5 },
        ],
        onNewMessage,
      }),
    );
    expect(onNewMessage).not.toHaveBeenCalled();
  });

  test("rerender with grown messageCount + unread > 0 → callback called once", () => {
    const onNewMessage = vi.fn();
    const { rerender } = renderHook(
      ({ convs }) =>
        useNewMessageEvents({
          conversations: convs,
          onNewMessage,
        }),
      {
        initialProps: {
          convs: [
            { id: "c1", label: "Alice", messageCount: 5, unread: 0 },
          ] as ConvInput[],
        },
      },
    );
    rerender({
      convs: [
        { id: "c1", label: "Alice", messageCount: 6, unread: 1 },
      ] as ConvInput[],
    });
    expect(onNewMessage).toHaveBeenCalledTimes(1);
    expect(onNewMessage).toHaveBeenCalledWith({
      conversationID: "c1",
      conversationLabel: "Alice",
    });
  });

  test("rerender with grown messageCount but unread = 0 → callback NOT called", () => {
    const onNewMessage = vi.fn();
    const { rerender } = renderHook(
      ({ convs }) =>
        useNewMessageEvents({
          conversations: convs,
          onNewMessage,
        }),
      {
        initialProps: {
          convs: [
            { id: "c1", label: "Alice", messageCount: 5, unread: 0 },
          ] as ConvInput[],
        },
      },
    );
    rerender({
      convs: [
        { id: "c1", label: "Alice", messageCount: 6, unread: 0 },
      ] as ConvInput[],
    });
    expect(onNewMessage).not.toHaveBeenCalled();
  });

  test("same convo growing again → callback called each time", () => {
    const onNewMessage = vi.fn();
    const { rerender } = renderHook(
      ({ convs }) =>
        useNewMessageEvents({
          conversations: convs,
          onNewMessage,
        }),
      {
        initialProps: {
          convs: [
            { id: "c1", label: "Alice", messageCount: 5, unread: 0 },
          ] as ConvInput[],
        },
      },
    );
    rerender({
      convs: [
        { id: "c1", label: "Alice", messageCount: 6, unread: 1 },
      ] as ConvInput[],
    });
    rerender({
      convs: [
        { id: "c1", label: "Alice", messageCount: 7, unread: 2 },
      ] as ConvInput[],
    });
    expect(onNewMessage).toHaveBeenCalledTimes(2);
  });

  test("identical rerender → callback NOT called", () => {
    const onNewMessage = vi.fn();
    const convs: ConvInput[] = [
      { id: "c1", label: "Alice", messageCount: 5, unread: 1 },
    ];
    const { rerender } = renderHook(() =>
      useNewMessageEvents({ conversations: convs, onNewMessage }),
    );
    rerender();
    rerender();
    expect(onNewMessage).not.toHaveBeenCalled();
  });

  test("new conversation appearing (no baseline) → callback NOT called", () => {
    // A conversation that didn't exist on the previous render is a "first
    // sighting" — no baseline, so we can't tell if it grew. Don't fire.
    const onNewMessage = vi.fn();
    const { rerender } = renderHook(
      ({ convs }) =>
        useNewMessageEvents({
          conversations: convs,
          onNewMessage,
        }),
      {
        initialProps: {
          convs: [
            { id: "c1", label: "Alice", messageCount: 5, unread: 0 },
          ] as ConvInput[],
        },
      },
    );
    rerender({
      convs: [
        { id: "c1", label: "Alice", messageCount: 5, unread: 0 },
        { id: "c2", label: "Bob", messageCount: 3, unread: 3 },
      ] as ConvInput[],
    });
    expect(onNewMessage).not.toHaveBeenCalled();
  });

  test("multiple convos grow simultaneously → callback called per convo", () => {
    const onNewMessage = vi.fn();
    const { rerender } = renderHook(
      ({ convs }) =>
        useNewMessageEvents({
          conversations: convs,
          onNewMessage,
        }),
      {
        initialProps: {
          convs: [
            { id: "c1", label: "Alice", messageCount: 5, unread: 0 },
            { id: "c2", label: "Bob", messageCount: 3, unread: 0 },
          ] as ConvInput[],
        },
      },
    );
    rerender({
      convs: [
        { id: "c1", label: "Alice", messageCount: 6, unread: 1 },
        { id: "c2", label: "Bob", messageCount: 4, unread: 1 },
      ] as ConvInput[],
    });
    expect(onNewMessage).toHaveBeenCalledTimes(2);
  });

  test("messageCount grew but unread unchanged → callback NOT called (self-sent-from-other-tab)", () => {
    // Regression: same account in two tabs. Tab A sends a message →
    // it syncs to tab B; tab B's messageCount for the conv grows by 1.
    // But the new message is self-authored, so getUnreadCount excludes
    // it → unread stays the same. The hook must NOT fire — otherwise
    // tab B plays a notification sound for the user's own message.
    const onNewMessage = vi.fn();
    const { rerender } = renderHook(
      ({ convs }) =>
        useNewMessageEvents({
          conversations: convs,
          onNewMessage,
        }),
      {
        initialProps: {
          convs: [
            // Bob has sent 3 prior unread messages
            { id: "c1", label: "Bob", messageCount: 3, unread: 3 },
          ] as ConvInput[],
        },
      },
    );
    rerender({
      convs: [
        // I (Alice) send my own message from tab A — tab B sees +1 to
        // messageCount but unread stays at 3 (own message excluded).
        { id: "c1", label: "Bob", messageCount: 4, unread: 3 },
      ] as ConvInput[],
    });
    expect(onNewMessage).not.toHaveBeenCalled();
  });

  test("unread drops then partially recovers → fires only when growing past previous low", () => {
    // User reads some messages (unread drops), then more arrive. Should
    // fire when unread > prev, where prev was the post-read value.
    const onNewMessage = vi.fn();
    const { rerender } = renderHook(
      ({ convs }) =>
        useNewMessageEvents({
          conversations: convs,
          onNewMessage,
        }),
      {
        initialProps: {
          convs: [
            { id: "c1", label: "Alice", messageCount: 5, unread: 5 },
          ] as ConvInput[],
        },
      },
    );
    // User opens conv: unread drops to 0 (no fire — drops never fire)
    rerender({
      convs: [
        { id: "c1", label: "Alice", messageCount: 5, unread: 0 },
      ] as ConvInput[],
    });
    expect(onNewMessage).not.toHaveBeenCalled();
    // New message arrives: unread goes to 1 (fire — grew from 0)
    rerender({
      convs: [
        { id: "c1", label: "Alice", messageCount: 6, unread: 1 },
      ] as ConvInput[],
    });
    expect(onNewMessage).toHaveBeenCalledTimes(1);
  });
});
