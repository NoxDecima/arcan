import { describe, test, expect } from "vitest";
import { parentOf } from "@/nav/parents";

describe("parentOf — hierarchical up-navigation map (feedback round 3)", () => {
  test("conversation detail → conversation list", () => {
    expect(parentOf("/conversations/co_zabc")).toBe("/conversations");
  });

  test("members → parent conversation", () => {
    expect(parentOf("/conversations/co_zabc/members")).toBe(
      "/conversations/co_zabc",
    );
  });

  test("new conversation → conversation list", () => {
    expect(parentOf("/conversations/new")).toBe("/conversations");
  });

  test("add contact → contacts tab", () => {
    expect(parentOf("/contacts/add")).toBe("/?tab=contacts");
  });

  test("scan → add contact", () => {
    expect(parentOf("/contacts/scan")).toBe("/contacts/add");
  });

  test("contact detail → contacts tab", () => {
    expect(parentOf("/contacts/co_zbob")).toBe("/?tab=contacts");
  });

  test("another user's profile → contacts tab", () => {
    expect(parentOf("/profile/co_zbob")).toBe("/?tab=contacts");
  });

  test("own profile → settings", () => {
    expect(parentOf("/profile/co_zme", { ownProfile: true })).toBe("/settings");
  });

  test("connections pages → contacts tab", () => {
    expect(parentOf("/connections/pending")).toBe("/?tab=contacts");
    expect(parentOf("/connections/live-invites")).toBe("/?tab=contacts");
  });

  test("settings sub-pages → settings", () => {
    expect(parentOf("/settings/change-password")).toBe("/settings");
    expect(parentOf("/settings/recovery-code")).toBe("/settings");
    expect(parentOf("/settings/feedback")).toBe("/settings");
  });

  test("settings root → home", () => {
    expect(parentOf("/settings")).toBe("/");
  });

  test("unknown route → home", () => {
    expect(parentOf("/what/is/this")).toBe("/");
  });

  test("trailing slashes tolerated", () => {
    expect(parentOf("/conversations/co_zabc/")).toBe("/conversations");
    expect(parentOf("/contacts/add/")).toBe("/?tab=contacts");
  });
});
