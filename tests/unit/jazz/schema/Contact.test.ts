import { describe, it, expect } from "vitest";
import { Contact, ContactBook } from "@/jazz/schema/Contact";

describe("Contact schema", () => {
  it("is defined and exported", () => {
    expect(Contact).toBeDefined();
    expect(Contact).toHaveProperty("builtin", "CoMap");
    expect(typeof Contact.create).toBe("function");
  });
});

describe("ContactBook schema", () => {
  it("is defined and exported", () => {
    expect(ContactBook).toBeDefined();
    expect(ContactBook).toHaveProperty("builtin", "CoList");
    expect(typeof ContactBook.create).toBe("function");
  });
});
