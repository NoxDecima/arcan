import { describe, test, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/jazz/displayName", () => ({
  // Echo the accountID so tests can assert on substrings without touching the
  // contactBook/profile resolution path.
  resolveDisplayName: ({ accountID }: { accountID: string }) => `User(${accountID})`,
}));

import {
  SystemEvent,
  formatSystemEventMessage,
} from "@/components/system-event";

describe("formatSystemEventMessage", () => {
  test("renamed: includes the new title and actor", () => {
    const msg = formatSystemEventMessage({
      kind: "renamed",
      actorName: "Alice",
      newTitle: "Trip planning",
    });
    expect(msg).toBe('Alice renamed the group to "Trip planning"');
  });

  test("renamed: missing newTitle → em-dash placeholder", () => {
    const msg = formatSystemEventMessage({
      kind: "renamed",
      actorName: "Alice",
    });
    expect(msg).toBe('Alice renamed the group to "—"');
  });

  test("added: actor + target", () => {
    expect(
      formatSystemEventMessage({
        kind: "added",
        actorName: "Alice",
        targetName: "Bob",
      }),
    ).toBe("Alice added Bob to the chat");
  });

  test("left: actor only", () => {
    expect(
      formatSystemEventMessage({ kind: "left", actorName: "Carol" }),
    ).toBe("Carol left the chat");
  });
});

describe("SystemEvent component", () => {
  test("renamed event renders with the new title", () => {
    const { getByTestId } = render(
      <SystemEvent
        event={{
          kind: "renamed",
          actorAccountID: "co_zAlice",
          newTitle: "Trip planning",
          occurredAt: new Date(),
        }}
        me={{ $jazz: { id: "co_zMe" } }}
      />,
    );
    const el = getByTestId("system-event-renamed");
    expect(el.textContent).toContain("Trip planning");
    expect(el.textContent).toContain("renamed the group to");
  });

  test("renamed event with missing newTitle renders em-dash", () => {
    const { getByTestId } = render(
      <SystemEvent
        event={{
          kind: "renamed",
          actorAccountID: "co_zAlice",
          occurredAt: new Date(),
        }}
        me={{ $jazz: { id: "co_zMe" } }}
      />,
    );
    const el = getByTestId("system-event-renamed");
    expect(el.textContent).toContain("—");
  });
});
