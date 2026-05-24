import { describe, it, expect } from "vitest";
import { createJazzTestAccount } from "jazz-tools/testing";
import { Group } from "jazz-tools";
import { JazzMessangerAccount } from "@/jazz/schema/JazzMessangerAccount";
import { SystemEvent } from "@/jazz/schema/SystemEvent";

describe("SystemEvent schema", () => {
  it("creates an 'added' event with actor + target", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const group = Group.create({ owner: me });
    const event = SystemEvent.create(
      {
        kind: "added",
        actorAccountID: "acc_alice",
        targetAccountID: "acc_bob",
        occurredAt: new Date("2026-05-24T10:00:00Z"),
      },
      { owner: group },
    );
    expect(event.kind).toBe("added");
    expect(event.actorAccountID).toBe("acc_alice");
    expect(event.targetAccountID).toBe("acc_bob");
    expect(event.occurredAt.getTime()).toBe(new Date("2026-05-24T10:00:00Z").getTime());
  });

  it("creates a 'left' event with no target", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const group = Group.create({ owner: me });
    const event = SystemEvent.create(
      {
        kind: "left",
        actorAccountID: "acc_alice",
        occurredAt: new Date(),
      },
      { owner: group },
    );
    expect(event.kind).toBe("left");
    expect(event.targetAccountID).toBeUndefined();
  });

  it("accepts all four kinds: added, removed, left, promoted", async () => {
    const me = await createJazzTestAccount({ AccountSchema: JazzMessangerAccount });
    const group = Group.create({ owner: me });
    const kinds = ["added", "removed", "left", "promoted"] as const;
    for (const kind of kinds) {
      const event = SystemEvent.create(
        {
          kind,
          actorAccountID: "acc_a",
          occurredAt: new Date(),
        },
        { owner: group },
      );
      expect(event.kind).toBe(kind);
    }
  });
});
