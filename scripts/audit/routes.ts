// scripts/audit/routes.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SURFACES } from "./surfaces.js";

const APP_TSX = resolve(process.cwd(), "src/App.tsx");

/**
 * Pull every `path="…"` value out of App.tsx. Catches `<Route path="…">`
 * declarations; we filter out wildcards (`*`) since they're catch-alls
 * redirecting elsewhere, not leaf surfaces. `/settings/*` is normalised
 * to `/settings` since the settings page is a single-page scroll today
 * with no nested sub-routes.
 */
export function declaredRoutes(): string[] {
  const src = readFileSync(APP_TSX, "utf8");
  const out = new Set<string>();
  const routeRe = /<Route\s+path="([^"]+)"/g;
  for (const m of src.matchAll(routeRe)) {
    const p = m[1];
    if (p === "*") continue;
    // /settings/* → /settings (no sub-routes today)
    out.add(p === "/settings/*" ? "/settings" : p);
  }
  return Array.from(out).sort();
}

/**
 * Normalises `/conversations/:id` and `/conversations/:convId` to the
 * same shape, and strips query strings, so the equality check ignores
 * param names. Also collapses `/?role=initiator`-style query suffixes.
 */
function routeShape(route: string): string {
  const noQuery = route.split("?")[0];
  return noQuery.replace(/:[A-Za-z0-9_]+/g, ":id");
}

/**
 * Some declared routes redirect to or render the same surface as another
 * route, and don't need their own SURFACES entry:
 *   /conversations  — renders the same ConversationsRoute as /
 *   /invite         — auth-optional landing that stashes the URL fragment
 *                     and redirects to /auth/login or /. No fragment-less
 *                     view worth capturing.
 */
const ROUTE_ALIASES: Record<string, string> = {
  "/conversations": "/",
};
const SKIP_ROUTES = new Set<string>(["/invite"]);

/**
 * Returns routes that App.tsx declares but no surface in `SURFACES`
 * exercises. Empty array = audit is complete.
 */
export function missingFromSurfaces(): string[] {
  const declared = declaredRoutes();
  const covered = new Set(SURFACES.map((s) => routeShape(s.route)));
  return declared
    .filter((r) => !SKIP_ROUTES.has(r))
    .map((r) => ROUTE_ALIASES[r] ?? r)
    .filter((r) => !covered.has(routeShape(r)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const missing = missingFromSurfaces();
  if (missing.length) {
    console.error(`Routes in App.tsx not covered by SURFACES:`);
    for (const r of missing) console.error(`  - ${r}`);
    process.exit(1);
  }
  console.log(`All ${declaredRoutes().length} declared routes are covered.`);
}
