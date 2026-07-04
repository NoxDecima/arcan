// Parity runner: builds the proto gallery, boots both servers, screenshots
// every cell on both sides for every theme/accent variant, pixel-diffs.
// Usage: npm run parity [-- --only cell-a,cell-b]
import { spawn, execSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
// Amendment: pixelmatch is ESM-only (package.json "type":"module"); pngjs also
// works as ESM. Use static imports for both; keep createRequire for playwright-core
// (CJS) and cells.json.
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const cellsSpec = require("./cells.json");

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const only = (process.argv.find((a) => a.startsWith("--only")) || "").split("=")[1]
  ?? (process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null);
const wanted = only ? only.split(",") : null;

execSync(`node ${here("./build-proto.mjs")}`, { stdio: "inherit" });
const { serve } = await import("./static-server.mjs");
const staticSrv = await serve(4174);
const vite = spawn("npx", ["vite", "--port", "4175", "--strictPort"], {
  cwd: here("../.."), stdio: "ignore",
});
// Wait for vite to accept connections (up to 30s; cold optimize-deps is slow)
const deadline = Date.now() + 30_000;
let viteUp = false;
while (Date.now() < deadline) {
  try {
    await fetch("http://localhost:4175/parity.html");
    viteUp = true;
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 250));
  }
}
if (!viteUp) {
  vite.kill();
  staticSrv.close();
  throw new Error("vite did not become ready on :4175 within 30s");
}

const REPORT = here("./report");
rmSync(REPORT, { recursive: true, force: true });
mkdirSync(REPORT, { recursive: true });

const d = cellsSpec.defaults;
const cells = cellsSpec.cells.filter((c) => !wanted || wanted.includes(c.id));
const variants = new Map(); // "theme/accent" -> cells
for (const cell of cells) {
  for (const theme of cell.themes ?? d.themes) {
    for (const accent of cell.accents ?? d.accents) {
      const k = `${theme}/${accent}`;
      if (!variants.has(k)) variants.set(k, []);
      variants.get(k).push(cell);
    }
  }
}

const browser = await chromium.launch();
const results = [];
const cleanup = () => { try { vite.kill(); } catch {} try { staticSrv.close(); } catch {} };
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });
try {
  for (const [variant, vcells] of variants) {
    const [theme, accent] = variant.split("/");
    const q = `?theme=${theme}&accent=${accent}`;
    const proto = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
    const app = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
    await proto.goto(`http://localhost:4174/tests/parity/proto-gallery.html${q}`);
    await app.goto(`http://localhost:4175/parity.html${q}`);
    await proto.waitForSelector('body[data-gallery-ready="1"]', { timeout: 15000 });
    await app.waitForSelector('body[data-gallery-ready="1"]', { timeout: 15000 });

    const dir = `${REPORT}/${theme}-${accent}`;
    mkdirSync(dir, { recursive: true });
    for (const cell of vcells) {
      const sel = `[data-cell="${cell.id}"]`;
      const [pBuf, aBuf] = [
        await proto.locator(sel).screenshot(),
        await app.locator(sel).screenshot(),
      ];
      const pImg = PNG.sync.read(pBuf);
      const aImg = PNG.sync.read(aBuf);
      let status, ratio = 1;
      if (pImg.width !== aImg.width || pImg.height !== aImg.height) {
        status = `SIZE ${pImg.width}x${pImg.height} vs ${aImg.width}x${aImg.height}`;
      } else {
        const diff = new PNG({ width: pImg.width, height: pImg.height });
        const n = pixelmatch(pImg.data, aImg.data, diff.data, pImg.width, pImg.height, { threshold: 0.1 });
        ratio = n / (pImg.width * pImg.height);
        writeFileSync(`${dir}/${cell.id}-diff.png`, PNG.sync.write(diff));
        status = ratio <= (cell.maxDiffRatio ?? d.maxDiffRatio) ? "PASS" : "FAIL";
      }
      writeFileSync(`${dir}/${cell.id}-proto.png`, pBuf);
      writeFileSync(`${dir}/${cell.id}-app.png`, aBuf);
      const failing = status !== "PASS" && !cell.advisory;
      results.push({ variant, id: cell.id, status: cell.advisory && status !== "PASS" ? `ADVISORY(${status})` : status, ratio, failing });
      const marker = failing ? "✗" : (cell.advisory && status !== "PASS") ? "~" : "✓";
      const pctStr = status.startsWith("SIZE") ? "—" : `${(ratio * 100).toFixed(3)}%`;
      console.log(`${marker} [${variant}] ${cell.id}: ${status} (${pctStr})`);
    }
    await proto.close();
    await app.close();
  }
} finally {
  await browser.close();
  vite.kill();
  staticSrv.close();
}

const failures = results.filter((r) => r.failing);
console.log(`\nparity: ${results.length - failures.length}/${results.length} pass — report at tests/parity/report/`);
if (failures.length) process.exit(1);
