import { describe, it, expect } from "vitest";
import { ArcanAccount, ArcanAccountRoot } from "@/jazz/schema/ArcanAccount";
import { createJazzTestAccount } from "jazz-tools/testing";

describe("ArcanAccount schema", () => {
  it("is defined and exported", () => {
    expect(ArcanAccount).toBeDefined();
    // jazz-tools 0.20.18 co.account() returns an AccountSchema instance (object)
    expect(ArcanAccount).toHaveProperty("builtin", "Account");
    expect(typeof ArcanAccount.create).toBe("function");
  });

  it("ArcanAccountRoot is defined and exported", () => {
    expect(ArcanAccountRoot).toBeDefined();
    expect(typeof ArcanAccountRoot.create).toBe("function");
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
      AccountSchema: ArcanAccount,
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

  // The migration self-register block is the sole writer of the signup
  // device's DeviceRecord. Asserting "exactly one" guards against future
  // refactors that might re-introduce a duplicate push (e.g. wiring up an
  // initiator-side pre-registration during pairing).
  it("signup produces exactly one DeviceRecord (self-register is idempotent)", async () => {
    const me = await createJazzTestAccount({
      AccountSchema: ArcanAccount,
      creationProps: { name: "Test User" },
      isCurrentActiveAccount: true,
    });

    const loaded = await me.$jazz.ensureLoaded({
      resolve: { root: { devices: { $each: true } } },
    });
    expect(loaded.root.devices.length).toBe(1);
  });
});
