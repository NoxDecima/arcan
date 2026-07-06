// Pre-transforms the prototype for the parity gallery (no CDN, no Babel):
//   vendor.js  = React 19 bundled as window globals
//   *.jsx      = esbuild JSX transform (classic runtime, window-global scripts)
import { build, transform } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
mkdirSync(here("./out"), { recursive: true });

await build({
  entryPoints: [here("./react-shim.js")],
  bundle: true,
  format: "iife",
  outfile: here("./out/vendor.js"),
  logLevel: "silent",
});

for (const f of ["../../design/hf-kit.jsx", "../../design/proto-ui.jsx", "../../design/hf-flows.jsx", "./proto-cells.jsx"]) {
  const src = readFileSync(here(f), "utf8");
  const out = await transform(src, {
    loader: "jsx",
    jsx: "transform",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    // Wrap in IIFE so each script has its own scope; files communicate via
    // window.* (hf-kit exports via Object.assign(window,{...}); proto-ui/cells
    // destructure from window). Without IIFE, `const` declarations across script
    // tags share global scope and collide (e.g. `alpha`, `HAv`, `skin`).
    format: "iife",
  });
  const name = f.split("/").pop().replace(/\.jsx$/, ".js");
  writeFileSync(here(`./out/${name}`), out.code);
}
console.log("parity: prototype gallery built");
