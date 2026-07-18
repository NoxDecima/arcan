// src/nav/transitions.ts — screen-transition direction + the transitioned
// location hook (UI motion spec, docs/superpowers/specs/2026-07-18-ui-motion-design.md).
//
// Direction derives from the SAME hierarchy that drives the header up button
// (parents.ts): navigating to a descendant slides forward, to an ancestor
// slides back; unrelated moves (tab roots, cross-branch jumps, anything
// touching the auth flow) cross-fade.

import { parentOf } from "./parents";

export type NavDirection = "forward" | "back" | "fade";

const AUTH_ROOTS = ["/auth", "/onboarding", "/pair", "/invite"];

function normalize(path: string): string {
  return path.split("?")[0].replace(/\/+$/, "") || "/";
}

function inAuthFlow(path: string): boolean {
  return AUTH_ROOTS.some((r) => path === r || path.startsWith(`${r}/`));
}

/** Walks the parentOf chain upward from `of`, looking for `candidate`. */
function isAncestor(candidate: string, of: string): boolean {
  let cur = of;
  // parents.ts is a finite tree rooted at "/" — 10 hops far exceeds its depth.
  for (let i = 0; i < 10; i++) {
    const parent = normalize(parentOf(cur));
    if (parent === cur) return false; // fixpoint ("/" → "/")
    if (parent === candidate) return true;
    cur = parent;
  }
  return false;
}

export function navDirection(from: string, to: string): NavDirection {
  const a = normalize(from);
  const b = normalize(to);
  if (a === b) return "fade";
  if (inAuthFlow(a) || inAuthFlow(b)) return "fade";
  if (isAncestor(b, a)) return "back";
  if (isAncestor(a, b)) return "forward";
  return "fade";
}
