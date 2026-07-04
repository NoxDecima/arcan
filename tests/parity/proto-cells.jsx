// Prototype-side parity cells. `s` is the live v5 skin for the requested
// theme/accent. Cells must mirror tests/parity/app-gallery/cells.tsx exactly.
// Verbatim copies of proto.jsx-local primitives accumulate here (each marked
// with its design/proto.jsx line range).
const { skin, alpha } = window;
const { Icon, HAv, PButton, PCard, PSectionLabel, PRow, PToggle, PField, PQR, PHeader, PTabBar, tapBtn, ArcanMark } = window;

const ICON_NAMES = ["search","plus","gear","back","chev","send","plusc","image","paperclip","chat","people","pencil","copy","share","camera","check","dots","bell","at","device","key","shield","logout","sun","moon","sparkle","alert","refresh","close","message"];

/* patched copy: design/proto.jsx:33–71 — one intent-fix, see Bubble:att inline note */
function ownPaintP(s) {
  const c = s.c;
  if (s.ownStyle === 'grad') return { bg: c.accentGrad, fg: c.onAccent, bd: 'transparent', time: alpha(c.onAccent, .6) };
  if (s.ownStyle === 'solid') return { bg: c.accentFill, fg: c.onAccent, bd: 'transparent', time: alpha(c.onAccent, .6) };
  const al = s.ownTint ? s.ownTint[s.theme] : (s.theme === 'dark' ? 0.16 : 0.12);
  return { bg: alpha(c.accentFill, al), fg: c.text, bd: c.accentBorder, time: c.dim };
}
function Bubble({ s, m, w }) {
  const c = s.c, mine = m.who === 'me';
  const p = mine ? ownPaintP(s) : { bg: c.panel, fg: c.text, bd: s.fam === 'soft' ? 'transparent' : c.border, time: c.dim };
  return (
    <div style={{ maxWidth: w, background: p.bg, border: p.bd !== 'transparent' ? `1px solid ${p.bd}` : 'none', color: p.fg, padding: m.att ? 6 : '8px 11px', borderRadius: s.bubbleRadius, borderBottomRightRadius: mine ? Math.max(2, s.bubbleRadius - 12) : s.bubbleRadius, borderBottomLeftRadius: mine ? s.bubbleRadius : Math.max(2, s.bubbleRadius - 12), boxShadow: s.soft && !mine && s.theme === 'light' ? '0 1px 2px rgba(20,20,40,.05)' : 'none' }}>
      {/* intent-fix: '#fff' → '#ffffff' — _hx('#fff') → [255,15,NaN] (3-digit shorthand: first two chars pair up, third slice empty → NaN); invalid rgba drops the veil in the raw proto. hf-chat.jsx:126 already uses #ffffff (designer's corrected version). */}
      {m.att && <div style={{ width: w - 12, height: 84, borderRadius: Math.max(3, s.bubbleRadius - 6), background: mine ? alpha('#ffffff', .18) : (s.theme === 'dark' ? '#0e1019' : '#eef0f5'), display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 5 }}><Icon d="image" c={mine ? alpha('#ffffff', .8) : c.dim} size={20} /></div>}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <span style={{ flex: 1, font: `400 12.5px/1.45 ${s.body}` }}>{m.text}</span>
        {m.time && <span style={{ font: `500 8.5px/1 ${s.font}`, color: p.time, flexShrink: 0, marginBottom: 1 }}>{m.time}</span>}
      </div>
    </div>
  );
}
function Row({ s, m, w }) {
  const c = s.c;
  if (m.who === 'sys') return <div style={{ alignSelf: 'center', font: `400 10px/1.4 ${s.font}`, color: c.dim, padding: '2px 0', textAlign: 'center' }}>{s.sysComment ? '// ' : ''}{m.text}</div>;
  if (m.who === 'new') return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
      <div style={{ flex: 1, height: 1, background: c.accent, opacity: .5 }} /><span style={{ font: `600 9px/1 ${s.font}`, letterSpacing: '.16em', textTransform: 'uppercase', color: c.accent }}>new</span><div style={{ flex: 1, height: 1, background: c.accent, opacity: .5 }} />
    </div>
  );
  const mine = m.who === 'me';
  return (
    <div style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end' }}>
      {!mine && <HAv s={s} txt={m.ini} size={28} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
        {!mine && m.name && <span style={{ font: `600 9.5px/1 ${s.headMono ? s.font : s.body}`, color: c.text2, marginLeft: 3 }}>{m.name}</span>}
        <Bubble s={s} m={m} w={w} />
      </div>
    </div>
  );
}
/* end patched copy */

/* verbatim copy: design/proto.jsx:145–152 (Fab) + :590–600 (Toast) */
function Fab({ s, onClick }) {
  const c = s.c;
  return (
    <button onClick={onClick} style={{ ...tapBtn, position: 'absolute', right: 16, bottom: 16, width: 52, height: 52, borderRadius: s.soft ? 999 : s.radius + 6, background: s.ownStyle === 'grad' ? c.accentGrad : c.accentFill, justifyContent: 'center', boxShadow: `0 8px 22px ${alpha(c.accentFill, .45)}`, zIndex: 4 }}>
      <Icon d="plus" c={c.onAccent} size={24} sw={2.2} />
    </button>
  );
}
function Toast({ s, data }) {
  const c = s.c;
  const tone = data.tone || 'neutral';
  const col = tone === 'success' ? c.green : tone === 'error' ? c.red : tone === 'accent' ? c.accent : c.text2;
  return (
    <div style={{ position: 'absolute', left: 14, right: 14, bottom: 18, zIndex: 30, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: s.radius + 2, background: c.panel, border: `1px solid ${c.border}`, boxShadow: s.theme === 'dark' ? '0 10px 30px rgba(0,0,0,.55)' : '0 10px 30px rgba(40,40,60,.18)', animation: 'hf-toastin .3s cubic-bezier(.2,.8,.2,1) both' }}>
      <span style={{ width: 22, height: 22, borderRadius: 999, background: alpha(col, s.theme === 'dark' ? .2 : .14), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon d={data.icon || 'bell'} c={col} size={13} /></span>
      <span style={{ flex: 1, font: `500 12px/1.3 ${s.body}`, color: c.text }}>{data.text}</span>
    </div>
  );
}

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

  // proto-ui.jsx lines 17-41 (PHeader) + 45-61 (PTabBar)
  "pheader-plain": (s) => (
    <PHeader s={s} title="decima"
      avatar={<HAv s={s} txt="me" size={30} />}
      onAvatar={() => {}}
      right={<button style={tapBtn} onClick={() => {}}><Icon d="gear" c={s.c.text2} size={20} /></button>}
    />
  ),

  "pheader-back": (s) => (
    <PHeader s={s}
      onBack={() => {}}
      title="settings"
      sub={<span style={{ font: `400 10.5px/1.2 ${s.body}`, color: s.c.dim }}>manage your account</span>}
    />
  ),

  "pheader-ontitle": (s) => (
    <PHeader s={s}
      avatar={<HAv s={s} txt="AK" size={30} />}
      title="ada · keyring"
      onTitle={() => {}}
      right={<button style={tapBtn} onClick={() => {}}><Icon d="dots" c={s.c.text2} size={20} /></button>}
    />
  ),

  "ptabbar": (s) => <PTabBar s={s} active="chats" onTab={() => {}} />,

  "ptabbar-contacts": (s) => <PTabBar s={s} active="contacts" onTab={() => {}} />,

  /* verbatim copy: design/proto.jsx:33–71 */
  "bubble-own": (s) => <Row s={s} m={{ who: 'me', text: 'nice. shipping it tonight.', time: '9:22' }} w={220} />,
  "bubble-theirs": (s) => <Row s={s} m={{ who: 'them', name: 'ada', ini: 'AK', text: 'schema diff looks good — merging now', time: '9:18' }} w={220} />,
  "bubble-att": (s) => <Row s={s} m={{ who: 'me', att: true, text: 'sow-042.png', time: '9:22' }} w={220} />,
  "bubble-sys": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Row s={s} m={{ who: 'sys', text: 'conversation created · end-to-end encrypted' }} w={300} />
    </div>
  ),
  "bubble-new": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Row s={s} m={{ who: 'new' }} w={300} />
    </div>
  ),

  /* verbatim copy: design/proto.jsx:145–152 (Fab) */
  "fab": (s) => <Fab s={s} onClick={() => {}} />,

  /* verbatim copy: design/proto.jsx:590–600 (Toast) */
  "toast-tones": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', height: 64 }}><Toast s={s} data={{ tone: 'neutral', icon: 'bell', text: 'saved' }} /></div>
      <div style={{ position: 'relative', height: 64 }}><Toast s={s} data={{ tone: 'success', icon: 'check', text: 'invite link copied' }} /></div>
      <div style={{ position: 'relative', height: 64 }}><Toast s={s} data={{ tone: 'error', icon: 'alert', text: "couldn't load invite" }} /></div>
      <div style={{ position: 'relative', height: 64 }}><Toast s={s} data={{ tone: 'accent', icon: 'copy', text: 'code copied' }} /></div>
    </div>
  ),

  /* hf-kit.jsx:195–241 (ArcanMark) */
  "arcanmark-tiers": (s) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <ArcanMark s={s} size={58} stacked={true} />
      <ArcanMark s={s} size={24} showWord={true} />
      <span style={{ color: s.c.text }}><ArcanMark s={s} size={12} showWord={false} mono={true} /></span>
    </div>
  ),

  "arcanmark-accents": (s) => <ArcanMark s={s} size={24} showWord={true} />,

  /* advisory: compares proto ArcanMark glyph to existing app Lattice */
  "lattice-verdict": (s) => <ArcanMark s={s} size={58} showWord={false} />,
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
