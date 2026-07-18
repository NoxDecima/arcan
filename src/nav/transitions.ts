// src/nav/transitions.ts — screen-transition direction + the transitioned
// location hook (UI motion spec, docs/superpowers/specs/2026-07-18-ui-motion-design.md).
//
// Direction derives from the SAME hierarchy that drives the header up button
// (parents.ts): navigating to a descendant slides forward, to an ancestor
// slides back; unrelated moves (tab roots, cross-branch jumps, anything
// touching the auth flow) cross-fade.
//
// Island routes (/pair, /invite) render in their own early-return shells in
// App.tsx and are never matched by the main route tables — so island exits
// always commit without a view transition to avoid animating from blank.

import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Location } from "react-router-dom";
import { parentOf } from "./parents";

export type NavDirection = "forward" | "back" | "fade";

const AUTH_ROOTS = ["/auth", "/onboarding", "/pair", "/invite"];

// Single-route islands render OUTSIDE the main route tables (App.tsx early
// returns). During an island exit the lagged displayed location can't render
// in the main table (it falls into the `*` redirect — a blank frame), so a
// view transition would animate from blank; island entry swaps instantly
// anyway. Island moves always commit without a transition.
const ISLANDS = ["/pair", "/invite"];

function inIsland(path: string): boolean {
  return ISLANDS.some((r) => path === r || path.startsWith(`${r}/`));
}

function normalize(path: string): string {
  return path.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
}

function inAuthFlow(path: string): boolean {
  return AUTH_ROOTS.some((r) => path === r || path.startsWith(`${r}/`));
}

/**
 * Walks the parentOf chain upward from `of`, looking for `candidate`.
 * Note: parentOf's `ownProfile` option is not plumbed through — /profile/:id is
 * always treated as a child of the contacts root ("/" after normalization), so
 * own-profile back-navigation direction may fade rather than slide; acceptable per plan.
 */
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

// lib.dom's startViewTransition typing depends on the TS version — a narrow
// local type keeps us independent of it.
type DocumentWithVT = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

/**
 * Returns the location the route table should RENDER. When the router
 * location changes, the swap is wrapped in document.startViewTransition with
 * html[data-nav-dir] stamped so tokens.css can animate the old/new
 * arcan-pane snapshots. Browsers without the API — and users with
 * prefers-reduced-motion — get the plain instant swap.
 *
 * Accepted nit (recorded in the plan header): chrome that keys off the LIVE
 * location (tab-bar visibility, active-row highlight) updates at transition
 * start and cross-fades via the root snapshot instead of sliding.
 *
 * Island routes (/pair, /invite) always commit instantly — see ISLANDS above.
 */
export function useTransitionedLocation(location: Location): Location {
  const [displayed, setDisplayed] = useState(location);
  const displayedRef = useRef(location);
  const genRef = useRef(0);

  useLayoutEffect(() => {
    const from = displayedRef.current;
    if (from.key === location.key) return;

    const commit = () => {
      displayedRef.current = location;
      setDisplayed(location);
    };

    const doc = document as DocumentWithVT;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const fromPath = from.pathname + from.search;
    const toPath = location.pathname + location.search;
    if (
      typeof doc.startViewTransition !== "function" ||
      reduceMotion ||
      // Same path+search re-push (double-click): nothing to animate — and a
      // no-op transition would skip an in-flight slide mid-animation.
      fromPath === toPath ||
      inIsland(from.pathname) ||
      inIsland(location.pathname)
    ) {
      commit();
      return;
    }

    const gen = ++genRef.current;
    document.documentElement.dataset.navDir = navDirection(fromPath, toPath);
    const vt = doc.startViewTransition(() => {
      flushSync(commit);
    });
    void vt.finished
      .finally(() => {
        // An interrupted (skipped) transition resolves while its successor
        // animates — only the newest navigation may clear the direction.
        if (genRef.current === gen) {
          delete document.documentElement.dataset.navDir;
        }
      })
      .catch(() => {});
  }, [location]);

  return displayed;
}
