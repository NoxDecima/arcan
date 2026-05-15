import { describe, it, expect } from "vitest";
import { JazzMessangerAccount, JazzMessangerAccountRoot } from "@/jazz/schema/JazzMessangerAccount";
import { createJazzTestAccount } from "jazz-tools/testing";

describe("JazzMessangerAccount schema", () => {
  it("is defined and exported", () => {
    expect(JazzMessangerAccount).toBeDefined();
    // jazz-tools 0.20.18 co.account() returns an AccountSchema instance (object)
    expect(JazzMessangerAccount).toHaveProperty("builtin", "Account");
    expect(typeof JazzMessangerAccount.create).toBe("function");
  });

  it("JazzMessangerAccountRoot is defined and exported", () => {
    expect(JazzMessangerAccountRoot).toBeDefined();
    expect(typeof JazzMessangerAccountRoot.create).toBe("function");
  });

  /**
   * Migration hook test.
   *
   * We use createJazzTestAccount (from jazz-tools/testing) to create a real
   * in-memory Jazz account with the migration applied. The Jazz testing
   * utilities run the full account init + migration sequence.
   *
   * Note: the migration runs synchronously-ish inside account creation;
   * the root fields are available immediately after createJazzTestAccount
   * resolves. However, deep-loading CoValue references in tests requires
   * care — we assert on the shape/existence of the top-level slots, which
   * are accessible without additional async loading steps.
   *
   * If createJazzTestAccount proves difficult to wire (e.g., requires WASM
   * crypto to be initialised), the shallow checks below cover the most
   * critical invariant: that the schema + migration compile and export
   * correctly. Full integration coverage lives in Phase D e2e tests.
   */
  it("migration initialises profile and root slots", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: JazzMessangerAccount,
      creationProps: { name: "Test User" },
      isCurrentActiveAccount: true,
    });

    // Profile slot must be populated by the migration
    expect(me.profile).toBeDefined();
    expect(me.profile).not.toBeNull();

    // Root slot must be populated by the migration
    expect(me.root).toBeDefined();
    expect(me.root).not.toBeNull();
  });
});
