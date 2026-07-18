import { describe, test, expect } from "vitest";
import { navDirection } from "@/nav/transitions";

// UI motion spec (2026-07-18): slide direction derives from the SAME
// hierarchy that drives the header up button (parents.ts). Descendant →
// forward, ancestor → back, everything else (tab switches, cross-branch
// jumps, auth flow) → fade.
describe("navDirection — screen-slide direction from the parents.ts hierarchy", () => {
  test("list → conversation detail drills forward", () => {
    expect(navDirection("/", "/conversations/co_z1")).toBe("forward");
  });

  test("conversation detail → members drills forward", () => {
    expect(
      navDirection("/conversations/co_z1", "/conversations/co_z1/members"),
    ).toBe("forward");
  });

  test("members → conversation detail goes back", () => {
    expect(
      navDirection("/conversations/co_z1/members", "/conversations/co_z1"),
    ).toBe("back");
  });

  test("multi-step ancestry: members → conversation list is also back", () => {
    expect(navDirection("/conversations/co_z1", "/conversations")).toBe("back");
    expect(navDirection("/conversations/co_z1/members", "/conversations")).toBe(
      "back",
    );
  });

  test("home → settings drills forward; settings → home goes back", () => {
    expect(navDirection("/", "/settings")).toBe("forward");
    expect(navDirection("/settings", "/")).toBe("back");
  });

  test("tab switches (same path, query change) fade", () => {
    expect(navDirection("/", "/?tab=contacts")).toBe("fade");
  });

  test("cross-branch moves fade (conversation → contact profile)", () => {
    expect(navDirection("/conversations/co_z1", "/profile/acc_1")).toBe("fade");
  });

  test("anything touching the auth flow fades — the auth/app swap must never slide", () => {
    expect(navDirection("/auth/login", "/onboarding")).toBe("fade");
    expect(navDirection("/auth/login", "/")).toBe("fade");
    expect(navDirection("/", "/auth/recovery")).toBe("fade");
  });

  test("trailing slashes and query strings are ignored for ancestry", () => {
    expect(
      navDirection("/conversations/co_z1/", "/conversations/co_z1/members?x=1"),
    ).toBe("forward");
  });

  test("settings sub-pages drill forward and back", () => {
    expect(navDirection("/settings", "/settings/change-password")).toBe("forward");
    expect(navDirection("/settings/change-password", "/settings")).toBe("back");
  });

  test("new-conversation drills forward from the list and back", () => {
    expect(navDirection("/conversations", "/conversations/new")).toBe("forward");
    expect(navDirection("/conversations/new", "/conversations")).toBe("back");
  });

  test("hash fragments are ignored for ancestry", () => {
    expect(navDirection("/settings#privacy", "/")).toBe("back");
  });
});
