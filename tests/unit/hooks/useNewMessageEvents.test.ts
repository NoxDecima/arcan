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
});
