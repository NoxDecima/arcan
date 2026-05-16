import { describe, it, expect } from "vitest";
import { FileBlob } from "@/jazz/schema/FileBlob";

describe("FileBlob schema", () => {
  it("is defined and exported", () => {
    expect(FileBlob).toBeDefined();
    // jazz-tools 0.20.18 uses schema objects (CoMapSchema instances), not classes
    expect(FileBlob).toHaveProperty("builtin", "CoMap");
    expect(typeof FileBlob.create).toBe("function");
  });
});
