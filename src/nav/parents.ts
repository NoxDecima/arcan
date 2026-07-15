// src/nav/parents.ts — hierarchical "up" targets for the top back button.
//
// Feedback round 3 (2026-07-15): the header back button always navigates UP
// (to the screen's structural parent), never back through browser history —
// navigate(-1) caused endless back loops on cross-navigation (conversation →
// profile → conversation → …). Android system/gesture back stays
// history-based (platform up-vs-back convention); only the in-app top button
// is hierarchical.
//
// This map is the single source of truth: when adding a screen with a header
// back button, add its parent here — never navigate(-1) in a header.

export interface UpOptions {
  /** /profile/:id is polymorphic — the container knows whose profile it is. */
  ownProfile?: boolean;
}

export function parentOf(pathname: string, opts: UpOptions = {}): string {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (/^\/conversations\/[^/]+\/members$/.test(path)) {
    return path.slice(0, -"/members".length);
  }
  if (path === "/conversations/new") return "/conversations";
  if (/^\/conversations\/[^/]+$/.test(path)) return "/conversations";
  if (path === "/contacts/scan") return "/contacts/add";
  if (path === "/contacts/add") return "/?tab=contacts";
  if (/^\/contacts\/[^/]+$/.test(path)) return "/?tab=contacts";
  if (/^\/profile\/[^/]+$/.test(path)) {
    return opts.ownProfile ? "/settings" : "/?tab=contacts";
  }
  if (path.startsWith("/connections/")) return "/?tab=contacts";
  if (/^\/settings\/.+/.test(path)) return "/settings";
  if (path === "/settings") return "/";
  return "/";
}
