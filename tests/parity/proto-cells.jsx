// Prototype-side parity cells. `s` is the live v5 skin for the requested
// theme/accent. Cells must mirror tests/parity/app-gallery/cells.tsx exactly.
// Verbatim copies of proto.jsx-local primitives accumulate here (each marked
// with its design/proto.jsx line range).
const { skin, alpha } = window;

const PROTO_CELLS = {
  "probe-swatch": (s) => (
    <div style={{ width: 200, height: 64, borderRadius: s.radius, border: `1px solid ${s.c.border}`, background: s.c.panel, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ font: `500 12.5px/1.2 ${s.font}`, color: s.c.text }}>probe // arcan</span>
    </div>
  ),
};

(async () => {
  const params = new URLSearchParams(location.search);
  const theme = params.get("theme") || "dark";
  const accent = params.get("accent") || "tokyo";
  const s = skin("v5", theme, accent);
  const spec = await (await fetch("/tests/parity/cells.json")).json();
  const bgOf = (name) => ({ bg: s.c.bg, panel: s.c.panel, stage: s.c.stage })[name || "bg"];

  const root = window.ReactDOMClient.createRoot(document.getElementById("cells"));
  root.render(
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
      {spec.cells.map((cell) => {
        const render = PROTO_CELLS[cell.id];
        const d = spec.defaults;
        return (
          <div key={cell.id} data-cell={cell.id}
            style={{ width: cell.width ?? d.width, height: cell.height, padding: cell.pad ?? d.pad, background: bgOf(cell.bg ?? d.bg), overflow: "hidden", position: "relative" }}>
            {render ? render(s) : <span style={{ color: "red" }}>MISSING PROTO CELL: {cell.id}</span>}
          </div>
        );
      })}
    </div>,
  );
  await document.fonts.ready;
  // double-rAF so React commit + fonts settle before the runner screenshots
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.body.setAttribute("data-gallery-ready", "1");
  }));
})();
