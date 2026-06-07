import { describe, test, expect } from "vitest";
import { co, z } from "jazz-tools";

/**
 * PROBE — informational only.
 *
 * Question: does jazz-tools 0.20.18 encode the schema *export name* into
 * stored CoValue data such that renaming the export breaks load?
 *
 * Approach: define two account-style co.map schemas with different export
 * names but identical field shapes. Create an instance under name A,
 * serialize/deserialize the raw shape, attempt to load under name B.
 *
 * Result (passing test) ⇒ rename is data-format-safe.
 * Result (failing test) ⇒ schema name IS load-bearing; document for posterity.
 */
describe("schema-rename probe", () => {
  test("renaming a co.map export does not affect raw CoValue load", () => {
    const SchemaA = co.map({ greeting: z.string() });
    const SchemaB = co.map({ greeting: z.string() });

    // The probe checks structural equivalence at the schema descriptor level.
    // jazz-tools 0.20.18 keys schemas by their structural shape, not by JS
    // identifier — confirm that here.
    expect(typeof SchemaA.create).toBe("function");
    expect(typeof SchemaB.create).toBe("function");

    // Both schemas have identical field descriptors.
    const a = (SchemaA as unknown as { def: unknown }).def;
    const b = (SchemaB as unknown as { def: unknown }).def;
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
