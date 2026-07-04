// Prototype-side parity cells. `s` is the live v5 skin for the requested
// theme/accent. Cells must mirror tests/parity/app-gallery/cells.tsx exactly.
// Verbatim copies of proto.jsx-local primitives accumulate here (each marked
// with its design/proto.jsx line range).
const { skin, alpha } = window;
const { Icon, HAv, PButton, PCard, PSectionLabel, PRow, PToggle, PField, PQR } = window;

const ICON_NAMES = ["search","plus","gear","back","chev","send","plusc","image","paperclip","chat","people","pencil","copy","share","camera","check","dots","bell","at","device","key","shield","logout","sun","moon","sparkle","alert","refresh","close","message"];

const PROTO_CELLS = {
  "probe-swatch": (s) => (
    <div style={{ width: 200, height: 64, borderRadius: s.radius, border: `1px solid ${s.c.border}`, background: s.c.panel, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ font: `500 12.5px/1.2 ${s.font}`, color: s.c.text }}>probe // arcan</span>
    </div>
  ),

  // hf-kit.jsx lines 115–146
  "icon-grid": (s) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {ICON_NAMES.map(n => <Icon key={n} d={n} c={s.c.text2} size={18} />)}
    </div>
  ),

  "icon-modes": (s) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Icon d="send" c={s.c.text2} size={16} fill />
      <Icon d="chev" c={s.c.dim} size={15} />
      <Icon d="gear" c={s.c.text2} size={20} />
      <div style={{ width: 52, height: 52, borderRadius: 999, background: s.c.accentFill, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon d="plus" c={s.c.onAccent} size={24} sw={2.2} />
      </div>
    </div>
  ),

  // hf-kit.jsx lines 103–114
  "hav-sizes": (s) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <HAv s={s} txt="AB" size={28} />
      <HAv s={s} txt="AB" size={34} />
      <HAv s={s} txt="AB" size={38} />
    </div>
  ),

  "hav-group": (s) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <HAv s={s} txt="AB" size={34} group />
      <HAv s={s} txt="AB" size={38} group />
    </div>
  ),

  "hav-status": (s) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <HAv s={s} txt="AB" size={38} status="online" ring={s.c.bg} />
      <HAv s={s} txt="AB" size={38} status="offline" ring={s.c.bg} />
    </div>
  ),

  // proto-ui.jsx lines 87–99
  "pbutton-variants": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <PButton s={s} label="connect" primary onClick={() => {}} />
      <PButton s={s} label="cancel" onClick={() => {}} />
      <PButton s={s} label="sign out" danger onClick={() => {}} />
      <PButton s={s} label="skip" ghost onClick={() => {}} />
    </div>
  ),

  "pbutton-full": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <PButton s={s} label="sign in" primary full onClick={() => {}} />
      <PButton s={s} label="send message" primary full icon="send" onClick={() => {}} />
    </div>
  ),

  // proto-ui.jsx lines 63–86
  "pcard-rows": (s) => (
    <div>
      <PSectionLabel s={s}>security</PSectionLabel>
      <PCard s={s}>
        <PRow s={s} icon="key" label="recovery code" sub="view or rotate" onClick={() => {}} />
        <PRow s={s} label="link valid for" value="24h" />
        <PRow s={s} icon="shield" label="verified devices" onClick={() => {}} />
        <PRow s={s} icon="logout" label="sign out" danger last />
      </PCard>
    </div>
  ),

  // proto-ui.jsx lines 108–118
  "pfield": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PField s={s} label="email" ph="you@domain.dev" />
      <PField s={s} label="display name" value="ada" />
      <PField s={s} label="recovery code" value="A1B2-C3D4-E5F6" mono />
    </div>
  ),

  // proto-ui.jsx lines 100–107
  "ptoggle": (s) => (
    <div style={{ display: 'flex', gap: 12 }}>
      <PToggle s={s} on={true} />
      <PToggle s={s} on={false} />
    </div>
  ),

  // proto-ui.jsx lines 121–130
  "pqr": (s) => <PQR s={s} size={128} />,
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
