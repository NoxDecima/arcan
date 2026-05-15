import { describe, it, expect } from "vitest";
import { DeviceRecord } from "@/jazz/schema/DeviceRecord";

describe("DeviceRecord schema", () => {
  it("is defined and exported", () => {
    expect(DeviceRecord).toBeDefined();
    expect(DeviceRecord).toHaveProperty("builtin", "CoMap");
    expect(typeof DeviceRecord.create).toBe("function");
  });
});
