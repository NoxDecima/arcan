// scripts/audit/capture-screens.ts

import { chromium, type BrowserContext } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SURFACES, type Surface } from "./surfaces.js";
import { seedState, type Substitutions } from "./fixtures.js";
import { missingFromSurfaces } from "./routes.js";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://localhost:5173";
const OUTPUT_DIR = resolve(
  process.cwd(),
  "docs/superpowers/audit/unit-8/live",
);

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 375, height: 812 },
] as const;

interface ManifestEntry {
  id: string;
  route: string;
  routeNavigated: string;
  state: string;
  viewport: string;
  file: string;
  capturedAt: string;
  skipped?: string;
}

async function main(): Promise<void> {
  // Coverage gate.
  const missing = missingFromSurfaces();
  if (missing.length) {
    console.error(`SURFACES is missing routes:`);
    for (const r of missing) console.error(`  - ${r}`);
    process.exit(1);
  }

  // Clean output. Re-runs always overwrite — the doc references current
  // files, not historical snapshots.
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // NOTE: api/auth.sqlite + .jazz-data/ must be wiped by the caller
  // before starting `npm run dev:all`. The fixture seeder uses
  // deterministic credentials; rerunning against a populated DB hits
  // duplicate-email errors on sign-up. See plan Phase 2 Task 2.1 Step 1.

  const browser = await chromium.launch();
  const manifest: ManifestEntry[] = [];
  const capturedAt = new Date().toISOString();

  // Per-state cache. Seeding (sign-up, multi-account dances, invite accept,
  // group create, etc.) is NOT idempotent — re-running the same fixture in
  // a fresh context against an already-populated api/sync corrupts state.
  // So we run each fixture exactly once per state in a "seed context",
  // snapshot its storageState (cookies + localStorage + IndexedDB) +
  // substitutions, then create per-viewport capture contexts pre-loaded
  // with that storage. Sign-in never re-runs.
  interface StateCache {
    storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
    subs: Substitutions;
  }
  const stateCache = new Map<string, StateCache | "failed">();

  async function getOrSeed(state: string): Promise<StateCache | null> {
    const hit = stateCache.get(state);
    if (hit === "failed") return null;
    if (hit) return hit;
    const seedCtx = await browser.newContext({
      baseURL: BASE_URL,
      // Use desktop viewport for seeding so any responsive UI the fixture
      // depends on (sidebar, contacts page, etc.) is in its desktop form.
      viewport: { width: 1440, height: 900 },
    });
    try {
      const subs = await seedState(seedCtx, state);
      // Include IndexedDB so Jazz's local-first session state carries
      // over to capture contexts (Better Auth cookies alone aren't enough
      // to reconstruct the Jazz account on a fresh device).
      const storageState = await seedCtx.storageState({ indexedDB: true });
      const entry: StateCache = { storageState, subs };
      stateCache.set(state, entry);
      console.log(`seeded: ${state}`);
      return entry;
    } catch (err) {
      console.error(`[seed failed] ${state}: ${err}`);
      stateCache.set(state, "failed");
      return null;
    } finally {
      await seedCtx.close().catch(() => {});
    }
  }

  let totalCaptured = 0;
  let totalSkipped = 0;

  try {
    for (const surface of SURFACES) {
      const seeded = await getOrSeed(surface.state);
      for (const viewport of VIEWPORTS) {
        const file = `${surface.id}--${viewport.name}.png`;
        if (!seeded) {
          console.error(`SKIP: ${file} — seed failed`);
          manifest.push({
            id: surface.id,
            route: surface.route,
            routeNavigated: "",
            state: surface.state,
            viewport: viewport.name,
            file,
            capturedAt,
            skipped: "seed failed",
          });
          totalSkipped += 1;
          continue;
        }
        const ctx = await browser.newContext({
          baseURL: BASE_URL,
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
          storageState: seeded.storageState,
        });
        try {
          const subs = seeded.subs;

          const navigated = applySubs(surface.route, subs);
          const captured = await captureOne(ctx, surface, navigated);
          if (!captured) {
            console.error(`SKIP: ${file} — capture failed`);
            manifest.push({
              id: surface.id,
              route: surface.route,
              routeNavigated: navigated,
              state: surface.state,
              viewport: viewport.name,
              file,
              capturedAt,
              skipped: "capture failed",
            });
            totalSkipped += 1;
            continue;
          }

          manifest.push({
            id: surface.id,
            route: surface.route,
            routeNavigated: navigated,
            state: surface.state,
            viewport: viewport.name,
            file,
            capturedAt,
          });
          totalCaptured += 1;
          console.log(`captured: ${file}`);
        } finally {
          await ctx.close().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close();
  }

  writeFileSync(
    resolve(OUTPUT_DIR, "manifest.json"),
    JSON.stringify({ capturedAt, surfaces: manifest }, null, 2) + "\n",
  );
  console.log(
    `\n${totalCaptured} screenshots written, ${totalSkipped} skipped, manifest at ${OUTPUT_DIR}/manifest.json`,
  );
}

async function captureOne(
  ctx: BrowserContext,
  surface: Surface,
  navigated: string,
): Promise<boolean> {
  const page = await ctx.newPage();
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(navigated, { waitUntil: "domcontentloaded", timeout: 20_000 });

    if (surface.waitFor) {
      try {
        await page.locator(surface.waitFor).first().waitFor({
          state: "visible",
          timeout: 15_000,
        });
      } catch {
        // best-effort — some surfaces (e.g. /pair?role=initiator with the
        // approval prompt) may transition through several states; we still
        // capture whatever rendered.
      }
    }

    if (surface.modalTrigger) {
      try {
        await page.locator(surface.modalTrigger).first().click({ timeout: 10_000 });
        // Give the modal a brief moment to mount.
        await page.waitForTimeout(300);
      } catch (err) {
        console.error(`modal trigger failed for ${surface.id}: ${err}`);
        return false;
      }
    }

    // Let layout settle.
    await page.waitForTimeout(200);

    await page.screenshot({
      path: resolve(OUTPUT_DIR, `${surface.id}--${currentViewportName(page)}.png`),
      fullPage: false,
      animations: "disabled",
      caret: "hide",
    });
    return true;
  } catch (err) {
    console.error(`capture failed for ${surface.id}: ${err}`);
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}

function currentViewportName(page: import("@playwright/test").Page): string {
  const vp = page.viewportSize();
  if (!vp) return "desktop";
  return vp.width >= 1024 ? "desktop" : "mobile";
}

function applySubs(route: string, subs: Substitutions): string {
  let out = route;
  if (subs.meId) out = out.replace(":meId", subs.meId);
  if (subs.bobId) out = out.replace(":bobId", subs.bobId);
  if (subs.charlieId) out = out.replace(":charlieId", subs.charlieId);
  if (subs.convId) out = out.replace(":convId", subs.convId);
  if (subs.bobContactId)
    out = out.replace(":bobContactId", subs.bobContactId);
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
