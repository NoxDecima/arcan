import { describe, test, expect } from "vitest";
import {
  planContactMigration,
  type ContactEntryView,
} from "@/jazz/contact-migration";

function entry(
  contactAccountID: string,
  pinnedFingerprint: string,
  addedAtMs: number,
  index: number,
): ContactEntryView {
  return { contactAccountID, pinnedFingerprint, addedAtMs, index };
}

describe("planContactMigration", () => {
  test("passes unique entries through keyed by account ID", () => {
    const plan = planContactMigration([
      entry("acc-a", "fp-a", 1000, 0),
      entry("acc-b", "fp-b", 2000, 1),
    ]);
    expect(plan.keepIndexByAccountID).toEqual({ "acc-a": 0, "acc-b": 1 });
    expect(plan.conflictByAccountID).toEqual({});
  });

  test("duplicate with SAME fingerprint: latest entry wins, no conflict", () => {
    const plan = planContactMigration([
      entry("acc-a", "fp-a", 1000, 0),
      entry("acc-a", "fp-a", 3000, 1),
      entry("acc-a", "fp-a", 2000, 2),
    ]);
    expect(plan.keepIndexByAccountID).toEqual({ "acc-a": 1 });
    expect(plan.conflictByAccountID).toEqual({});
  });

  test("duplicate with DIFFERENT fingerprints: OLDEST pin kept + conflict flagged (TOFU)", () => {
    const plan = planContactMigration([
      entry("acc-a", "fp-new", 5000, 0),
      entry("acc-a", "fp-old", 1000, 1),
    ]);
    expect(plan.keepIndexByAccountID).toEqual({ "acc-a": 1 });
    expect(plan.conflictByAccountID).toEqual({
      "acc-a": { observedFingerprint: "fp-new" },
    });
  });

  test("conflict records the LATEST differing fingerprint", () => {
    const plan = planContactMigration([
      entry("acc-a", "fp-old", 1000, 0),
      entry("acc-a", "fp-mid", 2000, 1),
      entry("acc-a", "fp-new", 3000, 2),
    ]);
    expect(plan.keepIndexByAccountID).toEqual({ "acc-a": 0 });
    expect(plan.conflictByAccountID).toEqual({
      "acc-a": { observedFingerprint: "fp-new" },
    });
  });

  test("same-timestamp tie: latest-wins uses highest index, oldest-pin uses lowest", () => {
    const same = planContactMigration([
      entry("acc-a", "fp-a", 1000, 0),
      entry("acc-a", "fp-a", 1000, 1),
    ]);
    expect(same.keepIndexByAccountID).toEqual({ "acc-a": 1 });
    const diff = planContactMigration([
      entry("acc-b", "fp-1", 1000, 0),
      entry("acc-b", "fp-2", 1000, 1),
    ]);
    expect(diff.keepIndexByAccountID).toEqual({ "acc-b": 0 });
    expect(diff.conflictByAccountID["acc-b"]).toEqual({
      observedFingerprint: "fp-2",
    });
  });

  test("conflict: keeps LATEST same-pin entry (freshest metadata), not oldest entry", () => {
    // fp-old appears at t=1000 (name "A") and t=3000 (name "B"); fp-new at t=2000.
    // Pin = fp-old (oldest entry's fp). Latest with that pin = index 2 (t=3000).
    const plan = planContactMigration([
      entry("acc-a", "fp-old", 1000, 0), // name "A" — oldest, establishes pin
      entry("acc-a", "fp-new", 2000, 1), // differing fp — conflict candidate
      entry("acc-a", "fp-old", 3000, 2), // name "B" — same pin, freshest metadata
    ]);
    expect(plan.keepIndexByAccountID).toEqual({ "acc-a": 2 });
    expect(plan.conflictByAccountID).toEqual({
      "acc-a": { observedFingerprint: "fp-new" },
    });
  });

  test("empty input → empty plan", () => {
    const plan = planContactMigration([]);
    expect(plan.keepIndexByAccountID).toEqual({});
    expect(plan.conflictByAccountID).toEqual({});
  });
});
