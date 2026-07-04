// App-side parity gallery. Mirrors tests/parity/proto-cells.jsx.
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "@/styles/tokens.css";
import "@/index.css";
import { createRoot } from "react-dom/client";
import { APP_CELLS } from "./cells";
import spec from "../cells.json";

const params = new URLSearchParams(location.search);
document.documentElement.setAttribute("data-theme", params.get("theme") || "dark");
document.documentElement.setAttribute("data-accent", params.get("accent") || "tokyo");

const style = document.createElement("style");
style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important} html,body{margin:0;background:#333}";
document.head.appendChild(style);

const BG: Record<string, string> = { bg: "bg-bg", panel: "bg-panel", stage: "bg-bg-stage" };
const d = spec.defaults;

createRoot(document.getElementById("cells")!).render(
  <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
    {spec.cells.map((cell: any) => {
      const render = (APP_CELLS as any)[cell.id];
      return (
        <div key={cell.id} data-cell={cell.id}
          className={`overflow-hidden relative ${BG[cell.bg ?? d.bg]}`}
          style={{ width: cell.width ?? d.width, height: cell.height, padding: cell.pad ?? d.pad }}>
          {render ? render() : <span style={{ color: "red" }}>MISSING APP CELL: {cell.id}</span>}
        </div>
      );
    })}
  </div>,
);

document.fonts.ready.then(() =>
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.body.setAttribute("data-gallery-ready", "1")),
  ),
);
