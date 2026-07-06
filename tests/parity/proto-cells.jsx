// Prototype-side parity cells. `s` is the live v5 skin for the requested
// theme/accent. Cells must mirror tests/parity/app-gallery/cells.tsx exactly.
// Verbatim copies of proto.jsx-local primitives accumulate here (each marked
// with its design/proto.jsx line range).
const { skin, alpha } = window;
const { Icon, HAv, PButton, PCard, PSectionLabel, PRow, PToggle, PField, PQR, PHeader, PTabBar, tapBtn, ArcanMark, Body } = window;
const { HF_CONVOS, HF_CONTACTS, HF_MSGS } = window;

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

/* verbatim copy: design/proto.jsx:567–579 (AuthShell), :658–673 (DesktopEmpty), :676–691 (DesktopWindow) */
function AuthShell({ s, children }) {
  const c = s.c;
  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.bg, overflow: 'hidden' }}>
      <svg width="320" height="320" viewBox="0 0 100 100" aria-hidden="true"
        style={{ position: 'absolute', right: -74, bottom: -86, color: c.text, opacity: s.theme === 'dark' ? 0.05 : 0.06, userSelect: 'none', pointerEvents: 'none' }}
        dangerouslySetInnerHTML={{ __html: (window.LATTICE ? window.LATTICE.full('currentColor') : '') }} />
      <div style={{ position: 'absolute', left: '22%', top: '20%', width: 4, height: 4, borderRadius: 4, background: c.accentFill, boxShadow: `0 0 10px ${alpha(c.accentFill, .6)}` }} />
      <div style={{ position: 'absolute', right: '24%', top: '26%', width: 3, height: 3, borderRadius: 3, background: '#bb9af7' }} />
      <div style={{ width: 280, maxWidth: '86%', display: 'flex', flexDirection: 'column', gap: 13, position: 'relative', padding: 18 }}>{children}</div>
    </div>
  );
}
function DesktopEmpty({ s, tab }) {
  const c = s.c;
  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, background: c.bg, overflow: 'hidden' }}>
      <svg width="360" height="360" viewBox="0 0 100 100" aria-hidden="true"
        style={{ position: 'absolute', right: -84, bottom: -96, color: c.text, opacity: s.theme === 'dark' ? 0.05 : 0.06, userSelect: 'none', pointerEvents: 'none' }}
        dangerouslySetInnerHTML={{ __html: (window.LATTICE ? window.LATTICE.full('currentColor') : '') }} />
      <div style={{ position: 'absolute', left: '30%', top: '28%', width: 4, height: 4, borderRadius: 4, background: c.accentFill, boxShadow: `0 0 10px ${alpha(c.accentFill, .6)}` }} />
      <div style={{ position: 'absolute', right: '32%', top: '34%', width: 3, height: 3, borderRadius: 3, background: '#bb9af7' }} />
      <ArcanMark s={s} size={58} stacked />
      <div style={{ textAlign: 'center', position: 'relative' }}>
        <div style={{ font: `600 15px/1.3 ${s.headMono ? s.font : s.body}`, color: c.text2 }}>{tab === 'contacts' ? 'select a contact' : 'select a conversation'}</div>
        <div style={{ marginTop: 6, font: `400 11.5px/1 ${s.body}`, color: c.dim }}>{s.sysComment ? '// end-to-end encrypted' : 'end-to-end encrypted'}</div>
      </div>
    </div>
  );
}
function DesktopWindow({ s, children, narrow }) {
  const c = s.c;
  return (
    <div style={{ width: narrow ? 'min(520px, 92vw)' : 'min(1200px, 95vw)', height: narrow ? 'min(620px, 88vh)' : 'min(88vh, 820px)', borderRadius: 14, overflow: 'hidden', border: `1px solid ${c.border}`, background: c.bg, boxShadow: s.theme === 'dark' ? '0 34px 90px rgba(0,0,0,.62)' : '0 34px 90px rgba(40,40,60,.24)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 38, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderBottom: `1px solid ${c.border}`, background: c.panel }}>
        <div style={{ display: 'flex', gap: 7 }}>{['#e2696e', '#e6b450', '#5fb87f'].map(col => <span key={col} style={{ width: 11, height: 11, borderRadius: 999, background: col, opacity: .9 }} />)}</div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 14px', borderRadius: 999, background: c.bg, border: `1px solid ${c.border}` }}>
            <ArcanMark s={s} size={12} mono showWord={false} /><span style={{ font: `500 10px/1 ${s.font}`, color: c.dim, letterSpacing: '.04em' }}>arcan · local-first</span>
          </div>
        </div>
        <div style={{ width: 52 }} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>{children}</div>
    </div>
  );
}

/* patched copy: design/proto.jsx:154–203 — typing + presence/verified dropped (NOX-31/33) */
/* 1:1 sub dropped entirely; status on HAv dropped; TypingRow removed; toast/nav stubbed. */
/* intent-fix: minWidth:0+overflow:hidden on the pill (flex min-width:auto overflow in fixed-width cells) and margin:0/padding:0 on the input (Chrome UA padding 1px 2px — absent under the app's preflight; the pill's explicit '0 12px' padding is the designed inset) */
function PChatScreen({ s, msgs, desktop, name, ini, isGroup }) {
  const c = s.c;
  /* v5 headMono=true: '@' prefix for 1:1; groups use bare name (proto:175) */
  const title = isGroup ? name : (s.headMono ? '@' + name : name);
  /* 1:1 sub: presence/verified dropped (NOX-31/33) → undefined */
  /* group sub: sysComment=true → '// N members', headMono=true → font-mono (proto:177) */
  const sub = isGroup
    ? <span style={{ font: `400 10px/1 ${s.font}`, color: c.text2 }}>{s.sysComment ? '// 5 members' : '5 members'}</span>
    : undefined;
  return (
    <React.Fragment>
      {/* header: status dropped on HAv; onBack desktop=undefined else stub (proto:182) */}
      <PHeader s={s} title={title} sub={sub} onBack={desktop ? undefined : () => {}}
        avatar={<HAv s={s} txt={ini} size={34} group={isGroup} ring={c.bg} />}
        onTitle={() => {}} />
      {/* timeline: flex-1 min-h-0, gap 10, pad 12, bg (proto:184); day marker top (proto:185) */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: 12, background: c.bg }}>
        <div style={{ alignSelf: 'center', font: `500 9px/1 ${s.font}`, letterSpacing: '.14em', textTransform: 'uppercase', color: c.dim }}>today</div>
        {msgs.map((m, i) => <Row key={i} s={s} m={m} w={desktop ? 460 : 190} />)}
      </div>
      {/* composer bar (proto:189): v5 soft=true → plusc 22, rounded-pill; prompt=true → › */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${c.border}`, padding: 10, display: 'flex', alignItems: 'center', gap: 9, background: c.bg }}>
        <button style={tapBtn}><Icon d="plusc" c={c.text2} size={22} /></button>
        <div style={{ flex: 1, /* intent-fix: minWidth:0+overflow:hidden — flex min-w-auto in fixed-w cells */ minWidth: 0, overflow: 'hidden', height: 38, borderRadius: 999, border: `1px solid ${c.border}`, background: c.bg, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
          <span style={{ font: `600 13px/1 ${s.font}`, color: c.accent }}>›</span>
          <input value="" readOnly placeholder={'message ' + name.split(' ')[0]}
            style={{ flex: 1, /* intent-fix: margin:0/padding:0 — Chrome UA padding absent under preflight */ margin: 0, padding: 0, border: 'none', outline: 'none', background: 'transparent', font: `400 12.5px/1 ${s.body}`, color: c.text, caretColor: c.accentFill }} />
        </div>
        {/* empty state → panel2 bg, dim icon (proto:197) */}
        <button style={{ ...tapBtn, width: 38, height: 38, borderRadius: 999, background: c.panel2, justifyContent: 'center' }}>
          <span style={{ display: "flex", transform: "translate(-1px, 1px)" }}>{/* user-decision patch: optical centering nudge, mirrors kit */}<Icon d="send" c={c.dim} size={16} fill /></span>
        </button>
      </div>
    </React.Fragment>
  );
}
/* end patched copy */

/* patched copy: design/proto.jsx:189–200 — same intent-fixes as PChatScreen's composer bar */
function PComposerBar({ s, text }) {
  const c = s.c;
  const armed = Boolean(text && text.trim());
  return (
    <div style={{ flexShrink: 0, borderTop: `1px solid ${c.border}`, padding: 10, display: 'flex', alignItems: 'center', gap: 9, background: c.bg }}>
      <button style={tapBtn}><Icon d="plusc" c={c.text2} size={22} /></button>
      <div style={{ flex: 1, /* intent-fix: minWidth:0+overflow:hidden — flex min-w-auto in fixed-w cells */ minWidth: 0, overflow: 'hidden', height: 38, borderRadius: 999, border: `1px solid ${c.border}`, background: c.bg, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
        <span style={{ font: `600 13px/1 ${s.font}`, color: c.accent }}>›</span>
        <input value={text || ''} readOnly placeholder="message ada"
          style={{ flex: 1, /* intent-fix: margin:0/padding:0 — Chrome UA padding absent under preflight */ margin: 0, padding: 0, border: 'none', outline: 'none', background: 'transparent', font: `400 12.5px/1 ${s.body}`, color: c.text, caretColor: c.accentFill }} />
      </div>
      <button style={{ ...tapBtn, width: 38, height: 38, borderRadius: 999, background: armed ? c.accentFill : c.panel2, justifyContent: 'center' }}>
        <span style={{ display: "flex", transform: "translate(-1px, 1px)" }}>{/* user-decision patch: optical centering nudge, mirrors kit */}<Icon d="send" c={armed ? c.onAccent : c.dim} size={16} fill /></span>
      </button>
    </div>
  );
}

/* patched copy: design/proto.jsx:86–143 — presence dropped (NOX-31), see manifest */
function PChatsScreen({ s, nav }) {
  const c = s.c;
  return (
    <React.Fragment>
      <PHeader s={s} title="decima" avatar={<HAv s={s} txt="me" size={30} />} onAvatar={() => nav.push('ownprofile')}
        right={<button onClick={() => nav.push('settings')} style={tapBtn}><Icon d="gear" c={c.text2} size={20} /></button>} />
      <Body s={s}>
        <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {HF_CONVOS.map((d, i) => (
            <button key={i} onClick={() => nav.push('chat', { name: d.n, ini: d.i, group: d.group })} style={{ ...tapBtn, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: s.radius }}>
              {/* patched: status={d.online ? 'online' : undefined} dropped (NOX-31) */}
              <HAv s={s} txt={d.i} size={38} group={d.group} ring={c.bg} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ flex: 1, font: `${d.unread ? 700 : 600} 12.5px/1.2 ${s.body}`, color: c.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.n}</span>
                  <span style={{ font: `500 9.5px/1 ${s.font}`, color: c.dim }}>{d.time}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ flex: 1, font: `${d.unread ? 500 : 400} 11px/1.3 ${s.body}`, color: d.unread ? c.text2 : c.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.last}</span>
                  {d.unread ? <span style={{ minWidth: 17, height: 17, padding: '0 5px', borderRadius: 999, background: c.accentFill, color: c.onAccent, font: `700 9.5px/17px ${s.font}`, textAlign: 'center' }}>{d.unread}</span> : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      </Body>
      <Fab s={s} onClick={() => nav.push('newconvo')} />
    </React.Fragment>
  );
}
function PContactRow({ s, d, onClick }) {
  const c = s.c;
  return (
    <button onClick={onClick} style={{ ...tapBtn, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: s.radius }}>
      <HAv s={s} txt={d.i} size={38} />
      <span style={{ flex: 1, font: `600 13px/1.2 ${s.body}`, color: c.text }}>{d.n}</span>
      <Icon d="chev" c={c.dim} size={16} />
    </button>
  );
}
function PContactsScreen({ s, nav }) {
  const c = s.c;
  return (
    <React.Fragment>
      <PHeader s={s} title="decima" avatar={<HAv s={s} txt="me" size={30} />} onAvatar={() => nav.push('ownprofile')}
        right={<button onClick={() => nav.push('settings')} style={tapBtn}><Icon d="gear" c={c.text2} size={20} /></button>} />
      <Body s={s}>
        <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {HF_CONTACTS.map((d, i) => (
            <PContactRow key={i} s={s} d={d} onClick={() => nav.push('profile', { name: d.n, ini: d.i })} />
          ))}
        </div>
      </Body>
      <Fab s={s} onClick={() => nav.push('addcontact')} />
    </React.Fragment>
  );
}
/* end patched copy */

/* patched copy: design/proto.jsx:731–780 — presence dropped (NOX-31) */
function PNavColumn({ s, tab }) {
  const c = s.c;
  const selName = tab === 'chats' ? 'ada · keyring' : null;

  const pTabBtn = (key, label) => {
    const on = tab === key;
    return (
      <button key={key} style={{ ...tapBtn, flex: 1, justifyContent: 'center', gap: 7, padding: '11px 0', borderBottom: `2px solid ${on ? c.accentFill : 'transparent'}`, marginBottom: -1 }}>
        <Icon d={key === 'contacts' ? 'people' : 'chat'} c={on ? c.accent : c.dim} size={15} />
        <span style={{ font: `${on ? 600 : 500} 11.5px/1 ${s.headMono ? s.font : s.body}`, color: on ? c.text : c.dim, letterSpacing: s.headMono ? '.04em' : 0 }}>{label}</span>
      </button>
    );
  };

  const pConvoRow = (d, i) => {
    const active = d.n === selName;
    return (
      <button key={i} style={{ ...tapBtn, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: s.radius, background: active ? c.accentSoft : 'transparent' }}>
        {/* patched: status={d.online ? 'online' : undefined} dropped (NOX-31) */}
        <HAv s={s} txt={d.i} size={38} group={d.group} ring={active ? c.accentSoft : c.bg} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flex: 1, font: `${d.unread ? 700 : 600} 12.5px/1.2 ${s.body}`, color: c.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.n}</span>
            <span style={{ font: `500 9.5px/1 ${s.font}`, color: c.dim }}>{d.time}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flex: 1, font: `${d.unread ? 500 : 400} 11px/1.3 ${s.body}`, color: d.unread ? c.text2 : c.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.last}</span>
            {d.unread ? <span style={{ minWidth: 17, height: 17, padding: '0 5px', borderRadius: 999, background: c.accentFill, color: c.onAccent, font: `700 9.5px/17px ${s.font}`, textAlign: 'center' }}>{d.unread}</span> : null}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div style={{ width: 320, flexShrink: 0, position: 'relative', borderRight: `1px solid ${c.border}`, background: c.bg, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px 10px' }}>
        <button style={{ ...tapBtn, gap: 10, flex: 1, minWidth: 0 }}>
          <HAv s={s} txt="me" size={32} />
          <span style={{ font: `700 14px/1.2 ${s.headMono ? s.font : s.body}`, color: c.text }}>decima</span>
        </button>
        <button style={tapBtn}><Icon d="gear" c={c.text2} size={19} /></button>
      </div>
      <div style={{ display: 'flex', borderBottom: `1px solid ${c.border}`, padding: '0 8px' }}>
        {pTabBtn('chats', 'chats')}
        {pTabBtn('contacts', 'contacts')}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {tab === 'chats'
          ? HF_CONVOS.map(pConvoRow)
          : HF_CONTACTS.map((d, i) => <PContactRow key={i} s={s} d={d} onClick={() => {}} />)}
      </div>
      <button style={{ ...tapBtn, position: 'absolute', right: 16, bottom: 16, width: 50, height: 50, borderRadius: s.soft ? 999 : s.radius + 6, background: s.ownStyle === 'grad' ? c.accentGrad : c.accentFill, justifyContent: 'center', boxShadow: `0 8px 22px ${alpha(c.accentFill, .45)}`, zIndex: 4 }}>
        <Icon d="plus" c={c.onAccent} size={23} sw={2.2} />
      </button>
    </div>
  );
}
/* end patched copy */

/* patched copy: design/proto.jsx:205–236 — '@' prefix dropped (rule 4);
   safety collapsed (no useState — open=false always);
   toast/nav stubbed; sharedConversations=undefined → "soon" row. */
function PProfileScreen({ s, params }) {
  const c = s.c;
  return (
    <React.Fragment>
      <PHeader s={s} title="profile" onBack={() => {}} right={<button style={tapBtn} onClick={() => {}}><Icon d="dots" c={c.text2} size={18} fill /></button>} />
      <Body s={s} pad={'24px 20px'}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 13 }}>
          <HAv s={s} txt={params.ini} size={80} />
          <div style={{ textAlign: 'center' }}>
            {/* '@' prefix dropped — rule 4 */}
            <div style={{ font: `700 19px/1.2 ${s.headMono ? s.font : s.body}`, color: c.text }}>{params.name}</div>
            {/* account-id line removed — user decision patch (2026-07-05 walkthrough) */}
          </div>
          <div style={{ width: '100%', maxWidth: 320 }}><PButton s={s} primary full icon="chat" label="message" onClick={() => {}} /></div>
          <PCard s={s} style={{ width: '100%', maxWidth: 320 }}>
            {/* Section order — user decision patch (2026-07-05 walkthrough):
                safety moved directly below action-buttons; shared-convos below it. */}
            {/* safety expander — collapsed (open=false); no expanded body rendered */}
            <button onClick={() => {}} style={{ ...tapBtn, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px' }}>
              <Icon d="check" c={c.accent} size={16} /><span style={{ flex: 1, font: `500 12px/1 ${s.body}`, color: c.text }}>verify safety number</span><span style={{ font: `600 13px/1 ${s.font}`, color: c.dim }}>▸</span>
            </button>
            <PRow s={s} icon="chat" label="shared conversations" last right={<span style={{ font: `600 9px/1 ${s.font}`, letterSpacing: '.1em', textTransform: 'uppercase', color: c.dim }}>soon</span>} />
          </PCard>
        </div>
      </Body>
    </React.Fragment>
  );
}
/* end patched copy */

/* patched copy: design/proto.jsx:238–259 — '@' prefix dropped (rule 4);
   toast handlers replaced with no-op stubs; no extra sections. */
function POwnProfileScreen({ s, params }) {
  const c = s.c;
  return (
    <React.Fragment>
      <PHeader s={s} title="your profile" onBack={() => {}} />
      <Body s={s} pad={'24px 20px'}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 13 }}>
          <div style={{ position: 'relative' }}>
            <HAv s={s} txt="me" size={80} />
            <button onClick={() => {}} style={{ ...tapBtn, position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 999, background: c.accentFill, border: `2px solid ${c.bg}`, justifyContent: 'center' }}><Icon d="camera" c={c.onAccent} size={14} /></button>
          </div>
          {/* '@' prefix dropped — rule 4; toast stub → no-op */}
          <button onClick={() => {}} style={{ ...tapBtn, gap: 8 }}><span style={{ font: `700 19px/1.2 ${s.headMono ? s.font : s.body}`, color: c.text }}>decima</span><Icon d="pencil" c={c.dim} size={15} /></button>
          {/* account-id line removed — user decision patch (2026-07-05 walkthrough) */}
          <div style={{ width: '100%', maxWidth: 320 }}><PButton s={s} primary full icon="plus" label="add a contact" onClick={() => {}} /></div>
          <PCard s={s} style={{ width: '100%', maxWidth: 320 }}>
            <PRow s={s} icon="gear" label="account & settings" onClick={() => {}} last />
          </PCard>
        </div>
      </Body>
    </React.Fragment>
  );
}
/* end patched copy */

/* patched copy: design/proto.jsx:261–317 (SettingsScreen) —
   toast/nav stubbed; theme/accent from s.theme/s.accentKey (skin object);
   ACCENT_KEYS/ACCENTS/lum from window (hf-kit). */
function PSettingsScreen({ s }) {
  const c = s.c;
  const theme = s.theme;
  const accent = s.accentKey;
  const [notif, setNotif] = React.useState(true);
  const [ment, setMent] = React.useState(true);
  const ACCENT_KEYS = window.ACCENT_KEYS;
  const ACCENTS = window.ACCENTS;
  const lum = window.lum;
  return (
    <React.Fragment>
      <PHeader s={s} title="settings" onBack={() => {}} />
      <Body s={s} pad={14}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* account */}
          <div>
            <PSectionLabel s={s}>account</PSectionLabel>
            <PCard s={s}>
              {/* MeRow: avatar moved to far left — user decision patch (2026-07-05 walkthrough);
                  proto:272 had it right-aligned. Custom row to allow leading ReactNode.
                  Font metrics match proto-ui.js PRow (12.5px/1.2 label, 10.5px/1.2 sub). */}
              <button onClick={() => {}} style={{ ...tapBtn, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: `1px solid ${c.border}` }}>
                <HAv s={s} txt="me" size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: `500 12.5px/1.2 ${s.body}`, color: c.text }}>decima</div>
                  <div style={{ marginTop: 3, font: `400 10.5px/1.2 ${s.body}`, color: c.dim }}>view your profile</div>
                </div>
                <Icon d="chev" c={c.dim} size={15} />
              </button>
              <PRow s={s} icon="key" label="change password" onClick={() => {}} />
              <PRow s={s} icon="shield" label="recovery code" onClick={() => {}} last />
            </PCard>
          </div>
          {/* feedback */}
          <PCard s={s}><PRow s={s} icon="message" iconColor={c.accent} label="give feedback" sub="report a bug or share an idea" onClick={() => {}} last /></PCard>
          {/* appearance */}
          <div>
            <PSectionLabel s={s}>appearance</PSectionLabel>
            <PCard s={s}>
              {/* theme row — proto:280–285 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: `1px solid ${c.border}` }}>
                <Icon d={theme === 'dark' ? 'moon' : 'sun'} c={c.text2} size={17} />
                <span style={{ flex: 1, font: `500 12.5px/1 ${s.body}`, color: c.text }}>theme</span>
                <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 999, background: c.panel2, border: `1px solid ${c.border}` }}>
                  {['light', 'dark'].map(t => (
                    <button key={t} onClick={() => {}} style={{ ...tapBtn, borderRadius: 999, padding: '5px 12px', font: `600 10.5px/1 ${s.font}`, color: theme === t ? c.onAccent : c.text2, background: theme === t ? c.accentFill : 'transparent' }}>{t}</button>
                  ))}
                </div>
              </div>
              {/* accent row — proto:287–296 */}
              <div style={{ padding: '13px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Icon d="sparkle" c={c.text2} size={17} />
                  <span style={{ flex: 1, font: `500 12.5px/1 ${s.body}`, color: c.text }}>accent color</span>
                  <span style={{ font: `400 11px/1 ${s.font}`, color: c.accent }}>{accent}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 14, paddingLeft: 29 }}>
                  {ACCENT_KEYS.map(k => {
                    const col = ACCENTS[k].solid, on = accent === k;
                    return (
                      <button key={k} onClick={() => {}} title={k} style={{ ...tapBtn, width: 28, height: 28, borderRadius: 999, background: col, border: on ? `2px solid ${c.text}` : '2px solid transparent', boxShadow: on ? `0 0 0 2px ${c.panel}, 0 0 10px ${alpha(col, .6)}` : 'none', justifyContent: 'center' }}>
                        {on && <Icon d="check" c={lum(col) > 0.55 ? '#0b0d14' : '#fff'} size={14} sw={3} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </PCard>
          </div>
          {/* notifications — patched: proto icons kept (bell/at) matching app fixture icons */}
          <div>
            <PSectionLabel s={s}>notifications</PSectionLabel>
            <PCard s={s}>
              <PRow s={s} icon="bell" label="new messages" right={<PToggle s={s} on={notif} onClick={() => setNotif(v => !v)} />} />
              <PRow s={s} icon="at" label="mentions only" sub="for group conversations" right={<PToggle s={s} on={ment} onClick={() => setMent(v => !v)} />} last />
            </PCard>
          </div>
          {/* devices */}
          <div>
            <PSectionLabel s={s}>devices</PSectionLabel>
            <PCard s={s}>
              <PRow s={s} icon="device" label="this device · macbook" value="active now" />
              <PRow s={s} icon="plus" label="link a device" onClick={() => {}} last />
            </PCard>
          </div>
          {/* sign out */}
          <PCard s={s}><PRow s={s} icon="logout" label="sign out" danger onClick={() => {}} last /></PCard>
        </div>
      </Body>
    </React.Fragment>
  );
}
/* end patched copy */

/* patched copy: design/proto.jsx:487–531 (FeedbackScreen) —
   toast/nav stubbed; state initialized to empty (text='', cat=null, attached=false);
   attachmentSlot = static dropzone matching empty state. */
function PFeedbackScreen({ s }) {
  const c = s.c;
  const [text, setText] = React.useState('');
  const [cat, setCat] = React.useState(null);
  const cats = [['bug', 'bug'], ['idea', 'idea'], ['question', 'question'], ['praise', 'praise']];
  return (
    <React.Fragment>
      <PHeader s={s} title="give feedback" onBack={() => {}} />
      <Body s={s} pad={16}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 520, width: '100%', margin: '0 auto' }}>
          {/* intro */}
          <div style={{ font: `400 11.5px/1.5 ${s.body}`, color: c.text2 }}>found a bug or have an idea? tell me — it goes straight to the maker.</div>
          {/* your feedback */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ font: `600 9px/1 ${s.font}`, letterSpacing: '.14em', textTransform: 'uppercase', color: c.dim }}>your feedback</span>
            <textarea value={text} onChange={e => setText(e.target.value)} placeholder="what's on your mind?"
              style={{ minHeight: 110, resize: 'none', borderRadius: s.radius, border: `1px solid ${c.border}`, background: c.panel, color: c.text, padding: '11px 12px', font: `400 12.5px/1.5 ${s.body}`, outline: 'none', caretColor: c.accentFill }} />
          </div>
          {/* category */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ font: `600 9px/1 ${s.font}`, letterSpacing: '.14em', textTransform: 'uppercase', color: c.dim }}>category · optional</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {cats.map(([k, lb]) => { const on = cat === k; return (
                <button key={k} onClick={() => setCat(on ? null : k)} style={{ ...tapBtn, padding: '7px 13px', borderRadius: s.soft ? 999 : s.radius, border: `1px solid ${on ? c.accentFill : c.border}`, background: on ? c.accentSoft : 'transparent', font: `600 11px/1 ${s.headMono ? s.font : s.body}`, color: on ? c.accent : c.text2 }}>{lb}</button>
              ); })}
            </div>
          </div>
          {/* attachment — not attached state (proto:520–522) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ font: `600 9px/1 ${s.font}`, letterSpacing: '.14em', textTransform: 'uppercase', color: c.dim }}>attachment · optional</span>
            <button onClick={() => {}} style={{ ...tapBtn, justifyContent: 'center', gap: 8, padding: '12px', borderRadius: s.radius, border: `1px dashed ${c.border}`, background: 'transparent' }}>
              <Icon d="paperclip" c={c.text2} size={15} /><span style={{ font: `500 11.5px/1 ${s.body}`, color: c.text2 }}>add a screenshot</span>
            </button>
          </div>
          {/* email field removed — user decision patch (2026-07-05 walkthrough):
              email inferred server-side from the authenticated account. */}
          {/* submit — opacity:.5 because text is empty */}
          <PButton s={s} primary full label="submit feedback" icon="send" onClick={() => {}} style={{ opacity: 0.5 }} />
        </div>
      </Body>
    </React.Fragment>
  );
}
/* end patched copy */

/* patched copy: design/proto.jsx:462–475 (LinkDeviceScreen) —
   toast/nav stubbed; linkUrl from prop; QR = PQR size=150;
   hf-typing-dot class retained (animation frozen by gallery: animation:none!important). */
function PLinkDeviceScreen({ s }) {
  const c = s.c;
  return (
    <React.Fragment>
      <PHeader s={s} title="link a device" onBack={() => {}} />
      <Body s={s} pad={'24px 20px'}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'center', font: `400 11.5px/1.5 ${s.body}`, color: c.text2 }}>open this link on your other device, or scan it</div>
          <PQR s={s} size={150} />
          <div style={{ display: 'flex', alignItems: 'stretch', width: '100%', maxWidth: 320, border: `1px solid ${c.border}`, borderRadius: s.radius, overflow: 'hidden' }}>
            <div style={{ flex: 1, minWidth: 0, padding: '0 12px', display: 'flex', alignItems: 'center', background: c.panel }}>
              <span style={{ font: `400 11px/1 ${s.font}`, color: c.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>arcan.app/link#k2f…a81</span>
            </div>
            <button onClick={() => {}} style={{ ...tapBtn, padding: '10px 13px', borderLeft: `1px solid ${c.border}`, background: c.panel, gap: 6 }}>
              <Icon d="copy" c={c.accent} size={13} />
              <span style={{ font: `600 11px/1 ${s.body}`, color: c.accent }}>copy</span>
            </button>
          </div>
          {/* waiting row — hf-typing-dot class retained (animation disabled in gallery) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ width: 7, height: 7, borderRadius: 7, background: c.accentFill }} className="hf-typing-dot" />
            <span style={{ font: `400 10.5px/1 ${s.body}`, color: c.dim }}>waiting for your other device…</span>
          </div>
        </div>
      </Body>
    </React.Fragment>
  );
}
/* end patched copy */

/* patched copy: design/proto.jsx:319–355 (ConvoSettingsScreen) —
   toast/nav stubbed; MEMBERS fixture defined locally (proto-module-local);
   dots kebab dropped in BOTH proto copy and app cell (renderMemberEnd=undefined → match);
   bespoke 70px group avatar (radius 16 = s.radius+4), NOT HAv. */
const PCONVO_MEMBERS = [
  { i: 'DC', n: 'decima', r: 'admin', you: true }, { i: 'RA', n: 'rana', r: 'admin' },
  { i: 'JM', n: 'jun mori', r: 'writer' }, { i: 'AK', n: 'ada', r: 'writer' }, { i: 'TZ', n: 'theo z.', r: 'writer' },
];
function PConvoSettingsScreen({ s }) {
  const c = s.c;
  const admins = PCONVO_MEMBERS.filter(m => m.r === 'admin');
  const writers = PCONVO_MEMBERS.filter(m => m.r === 'writer');
  /* dots kebab dropped (both sides) — parity: renderMemberEnd omitted in app cell */
  const memRow = (m, i) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px' }}>
      <HAv s={s} txt={m.i} size={36} />
      <span style={{ flex: 1, minWidth: 0, font: `600 12.5px/1.2 ${s.body}`, color: c.text }}>
        {m.n}{m.you && <span style={{ color: c.dim, fontWeight: 400 }}> · you</span>}
      </span>
      <span style={{ font: `600 9px/1 ${s.font}`, letterSpacing: '.08em', textTransform: 'uppercase', padding: '4px 8px', borderRadius: 999, background: m.r === 'admin' ? c.accentSoft : c.panel2, color: m.r === 'admin' ? c.accent : c.text2, border: `1px solid ${m.r === 'admin' ? c.accentBorder : c.border}` }}>{m.r}</span>
      {/* dots button dropped — see patch note */}
    </div>
  );
  return (
    <React.Fragment>
      <PHeader s={s} title="conversation settings" onBack={() => {}} />
      <Body s={s}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, padding: '24px 18px 18px', borderBottom: `1px solid ${c.border}` }}>
          <div style={{ position: 'relative' }}>
            {/* bespoke 70px group avatar: radius 16 (s.radius+4), NOT HAv */}
            <div style={{ width: 70, height: 70, borderRadius: 16, background: alpha('#bb9af7', s.theme === 'dark' ? .2 : .15), border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `600 22px/1 ${s.font}`, color: '#bb9af7' }}>RS</div>
            <button onClick={() => {}} style={{ ...tapBtn, position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 999, background: c.accentFill, border: `2px solid ${c.bg}`, justifyContent: 'center' }}><Icon d="camera" c={c.onAccent} size={13} /></button>
          </div>
          <button onClick={() => {}} style={{ ...tapBtn, gap: 8 }}>
            <span style={{ font: `700 18px/1.2 ${s.headMono ? s.font : s.body}`, color: c.text }}>retrieval-squad</span>
            <Icon d="pencil" c={c.dim} size={14} />
          </button>
          <span style={{ font: `400 11px/1 ${s.headMono ? s.font : s.body}`, color: c.dim }}>{'// 5 members · created 2026-04-18'}</span>
        </div>
        <div style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px 8px' }}>
            <span style={{ flex: 1, font: `600 9px/1 ${s.font}`, letterSpacing: '.16em', textTransform: 'uppercase', color: c.dim }}>{'// admins'}</span>
            <button onClick={() => {}} style={{ ...tapBtn, gap: 6, padding: '5px 11px', borderRadius: 999, background: c.accentFill }}>
              <Icon d="plus" c={c.onAccent} size={13} sw={2.4} />
              <span style={{ font: `600 11px/1 ${s.headMono ? s.font : s.body}`, color: c.onAccent }}>add people</span>
            </button>
          </div>
          {admins.map(memRow)}
          <div style={{ padding: '14px 8px 8px' }}><span style={{ font: `600 9px/1 ${s.font}`, letterSpacing: '.16em', textTransform: 'uppercase', color: c.dim }}>{'// members'}</span></div>
          {writers.map(memRow)}
          <div style={{ marginTop: 18 }}><PButton s={s} danger full label="leave conversation" onClick={() => {}} /></div>
        </div>
      </Body>
    </React.Fragment>
  );
}
/* end patched copy */

/* patched copy: design/proto.jsx:357–396 (NewConvoScreen) —
   toast/nav stubbed; HF_CONTACTS from window; sel=[0,3] (AK+RA → isGroup=true);
   groupNameSlot = static placeholder pill;
   bespoke 42px group placeholder avatar: radius 14 (s.radius+2), NOT HAv. */
function PNewConvoScreen({ s }) {
  const c = s.c;
  const [sel, setSel] = React.useState([0, 3]);
  const toggle = i => setSel(a => a.includes(i) ? a.filter(x => x !== i) : [...a, i]);
  const isGroup = sel.length >= 2;
  return (
    <React.Fragment>
      <PHeader s={s} title="new conversation" onBack={() => {}} />
      {isGroup && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderBottom: `1px solid ${c.border}` }}>
          {/* bespoke 42px group-placeholder avatar: radius 14 (s.radius+2), NOT HAv */}
          <div style={{ width: 42, height: 42, borderRadius: 14, background: alpha('#bb9af7', s.theme === 'dark' ? .2 : .15), border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bb9af7', font: `600 14px/1 ${s.font}` }}>?</div>
          <div style={{ flex: 1, height: 36, borderRadius: s.radius, border: `1px solid ${c.border}`, background: c.panel, display: 'flex', alignItems: 'center', padding: '0 12px' }}>
            <span style={{ font: `400 12px/1 ${s.body}`, color: c.dim }}>group name (optional)</span>
          </div>
        </div>
      )}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', padding: '12px 16px 6px' }}>
        <span style={{ flex: 1, font: `600 9px/1 ${s.font}`, letterSpacing: '.16em', textTransform: 'uppercase', color: c.dim }}>{'// contacts'}</span>
        <span style={{ font: `400 10px/1 ${s.body}`, color: c.dim }}>one · two+ = group</span>
      </div>
      <Body s={s}>
        <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {HF_CONTACTS.map((d, i) => { const on = sel.includes(i); return (
            <button key={i} onClick={() => toggle(i)} style={{ ...tapBtn, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: s.radius, background: on ? c.accentSoft : 'transparent' }}>
              <HAv s={s} txt={d.i} size={36} />
              <span style={{ flex: 1, font: `600 12.5px/1.2 ${s.body}`, color: c.text }}>{d.n}</span>
              <span style={{ width: 20, height: 20, borderRadius: s.radius - 2, border: `1.5px solid ${on ? c.accentFill : c.border}`, background: on ? c.accentFill : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on && <Icon d="check" c={c.onAccent} size={12} sw={3} />}</span>
            </button>
          ); })}
        </div>
      </Body>
      <div style={{ flexShrink: 0, padding: 12, borderTop: `1px solid ${c.border}`, background: c.bg }}>
        <PButton s={s} primary full label={`create group · ${sel.length} members`} onClick={() => {}} style={{ opacity: 1 }} />
      </div>
    </React.Fragment>
  );
}
/* end patched copy */

/* patched copy: design/proto.jsx:433–457 (AddPeopleScreen) —
   toast/nav stubbed; local pool fixture defined (proto-module-local);
   sel=[0,1] → EL+NX selected; groupName="retrieval-squad". */
const PADD_PEOPLE_POOL = [{ i: 'EL', n: 'eli · device-2' }, { i: 'NX', n: 'nox / ops' }, { i: 'KS', n: 'ko shin' }, { i: 'MP', n: 'mara p.' }];
function PAddPeopleScreen({ s }) {
  const c = s.c;
  const [sel, setSel] = React.useState([0, 1]);
  const toggle = i => setSel(a => a.includes(i) ? a.filter(x => x !== i) : [...a, i]);
  return (
    <React.Fragment>
      <PHeader s={s} title="add people" sub={<span style={{ font: `400 10px/1 ${s.body}`, color: c.text2 }}>to retrieval-squad</span>} onBack={() => {}} />
      <Body s={s}>
        <div style={{ padding: '10px 8px 0' }}><PSectionLabel s={s}>contacts not in this group</PSectionLabel></div>
        <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {PADD_PEOPLE_POOL.map((d, i) => { const on = sel.includes(i); return (
            <button key={i} onClick={() => toggle(i)} style={{ ...tapBtn, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: s.radius, background: on ? c.accentSoft : 'transparent' }}>
              <HAv s={s} txt={d.i} size={36} />
              <span style={{ flex: 1, font: `600 12.5px/1.2 ${s.body}`, color: c.text }}>{d.n}</span>
              <span style={{ width: 20, height: 20, borderRadius: s.radius - 2, border: `1.5px solid ${on ? c.accentFill : c.border}`, background: on ? c.accentFill : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on && <Icon d="check" c={c.onAccent} size={12} sw={3} />}</span>
            </button>
          ); })}
        </div>
      </Body>
      <div style={{ flexShrink: 0, padding: 12, borderTop: `1px solid ${c.border}` }}>
        <PButton s={s} primary full label={`add ${sel.length} ${sel.length === 1 ? 'person' : 'people'}`} onClick={() => {}} style={{ opacity: sel.length ? 1 : .5 }} />
      </div>
    </React.Fragment>
  );
}
/* end patched copy */

/* patched copy: design/proto.jsx:398–431 (AddContactScreen) —
   toast/nav stubbed; QR = PQR size=128;
   two-button copy/share → one adaptive action per 9-7 §2-J (see patch note inline);
   TTL options patched to app presets ['1h','24h','7d'], '24h' selected (deviation noted in manifest). */
function PAddContactScreen({ s }) {
  const c = s.c;
  const [ttl, setTtl] = React.useState('24h');
  const ttlOpts = ['1h', '24h', '7d'];
  return (
    <React.Fragment>
      <PHeader s={s} title="add contact" onBack={() => {}} />
      <Body s={s} pad={'22px 20px'}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ font: `700 18px/1.25 ${s.headMono ? s.font : s.body}`, color: c.text }}>add a contact</div>
            <div style={{ marginTop: 6, font: `400 11.5px/1.4 ${s.body}`, color: c.text2 }}>share your code so people can add you</div>
          </div>
          <PCard s={s} style={{ width: '100%', maxWidth: 300, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 11 }}>
            <span style={{ font: `600 9px/1 ${s.font}`, letterSpacing: '.16em', textTransform: 'uppercase', color: c.dim }}>{'// your code'}</span>
            <PQR s={s} size={128} />
            <span style={{ font: `400 11px/1 ${s.font}`, color: c.dim }}>co_z1a8…4f2</span>
            {/* patched copy: two-button copy/share → one adaptive action per 9-7 §2-J */}
            <PButton s={s} full label="copy link" icon="copy" onClick={() => {}} />
            <div style={{ width: '100%', borderTop: `1px solid ${c.border}`, paddingTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, font: `500 11px/1 ${s.body}`, color: c.text2 }}>link valid for</span>
              <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 999, background: c.bg, border: `1px solid ${c.border}` }}>
                {ttlOpts.map(o => { const on = o === ttl; return <button key={o} onClick={() => setTtl(o)} style={{ ...tapBtn, padding: '4px 9px', borderRadius: 999, font: `600 10px/1 ${s.font}`, color: on ? c.onAccent : c.text2, background: on ? c.accentFill : 'transparent' }}>{o}</button>; })}
              </div>
            </div>
          </PCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', maxWidth: 300 }}><div style={{ flex: 1, height: 1, background: c.border }} /><span style={{ font: `600 9px/1 ${s.font}`, letterSpacing: '.12em', textTransform: 'uppercase', color: c.dim }}>add someone</span><div style={{ flex: 1, height: 1, background: c.border }} /></div>
          <div style={{ width: '100%', maxWidth: 300 }}><PButton s={s} primary full label="scan their code" icon="search" onClick={() => {}} /></div>
          <button style={tapBtn} onClick={() => {}}><span style={{ font: `400 10.5px/1 ${s.body}`, color: c.accent }}>or paste a link</span></button>
        </div>
      </Body>
    </React.Fragment>
  );
}
/* end patched copy */

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

  /* verbatim copy: design/proto.jsx:567–579 (AuthShell), :658–673 (DesktopEmpty), :676–691 (DesktopWindow) */
  "auth-shell": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AuthShell s={s}>
        <PField s={s} label="email" ph="you@domain.dev" />
        <PButton s={s} primary full label="sign in" onClick={() => {}} />
      </AuthShell>
    </div>
  ),

  "desktop-empty": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <DesktopEmpty s={s} tab="chats" />
    </div>
  ),

  "desktop-window": (s) => (
    <DesktopWindow s={s} narrow>
      <DesktopEmpty s={s} tab="chats" />
    </DesktopWindow>
  ),

  /* mobile-shell: no verbatim — assembled from Body + PTabBar + Toast mirroring proto.jsx:642–649 minus dressing */
  "mobile-shell": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', background: s.c.bg }}>
        <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Body s={s} pad={16}>
            <PCard s={s}>
              <PRow s={s} icon="key" label="recovery code" sub="view or rotate" onClick={() => {}} last />
            </PCard>
          </Body>
        </div>
        <PTabBar s={s} active="chats" onTab={() => {}} />
        <Toast s={s} data={{ tone: 'neutral', icon: 'bell', text: 'saved' }} />
      </div>
    </div>
  ),

  /* patched copy: design/proto.jsx:205–236 (ProfileScreen) — '@' dropped, safety collapsed */
  "profile-screen": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PProfileScreen s={s} params={{ name: 'ada · keyring', ini: 'AK' }} />
    </div>
  ),

  /* patched copy: design/proto.jsx:238–259 (OwnProfileScreen) — '@' dropped, toast stubbed */
  "own-profile-screen": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <POwnProfileScreen s={s} params={{ name: 'decima', ini: 'me' }} />
    </div>
  ),

  /* patched copy: design/proto.jsx:261–317 (SettingsScreen) — toast/nav stubbed;
     theme/accent from skin; ACCENT_KEYS/ACCENTS/lum from window; boxShadow glow dropped. */
  "settings-screen": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PSettingsScreen s={s} />
    </div>
  ),

  /* patched copy: design/proto.jsx:487–531 (FeedbackScreen) — empty state (text='', cat=null). */
  "feedback-screen": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PFeedbackScreen s={s} />
    </div>
  ),

  /* patched copy: design/proto.jsx:462–475 (LinkDeviceScreen) — QR = PQR; pulse static. */
  "link-device-screen": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PLinkDeviceScreen s={s} />
    </div>
  ),

  /* patched copy: design/proto.jsx:86–114 (ChatsScreen) — presence dropped (NOX-31) */
  "chats-screen": (s) => {
    const nav = { push: () => {} };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PChatsScreen s={s} nav={nav} />
      </div>
    );
  },

  /* patched copy: design/proto.jsx:116–143 (ContactsScreen + ContactRow) — presence dropped (NOX-31) */
  "contacts-screen": (s) => {
    const nav = { push: () => {} };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <PContactsScreen s={s} nav={nav} />
      </div>
    );
  },

  /* patched copy: design/proto.jsx:731–780 (DesktopApp left column) — presence dropped (NOX-31) */
  "nav-column": (s) => <PNavColumn s={s} tab="chats" />,
  "nav-column-contacts": (s) => <PNavColumn s={s} tab="contacts" />,

  /* patched copy: design/proto.jsx:154–203 — typing + presence/verified dropped (NOX-31/33) */
  /* Seed: SEED['ada · keyring'] === HF_MSGS; proto renders day-marker + msgs.map(Row). */
  "chat-screen": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PChatScreen s={s} msgs={HF_MSGS} desktop={false} name="ada · keyring" ini="AK" isGroup={false} />
    </div>
  ),

  /* desktop variant: same seed, w=460, no back button (proto: desktop ? undefined : nav.pop) */
  "chat-screen-desktop": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PChatScreen s={s} msgs={HF_MSGS} desktop={true} name="ada · keyring" ini="AK" isGroup={false} />
    </div>
  ),

  /* two composer bars: empty + "on it" armed (proto:189–200) */
  "chat-composer-states": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', background: s.c.bg }}>
      <PComposerBar s={s} text="" />
      <PComposerBar s={s} text="on it" />
    </div>
  ),

  /* patched copy: design/proto.jsx:319–355 (ConvoSettingsScreen) — dots dropped in both */
  "convo-settings-screen": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PConvoSettingsScreen s={s} />
    </div>
  ),

  /* patched copy: design/proto.jsx:357–396 (NewConvoScreen) — sel=[0,3]; groupNameSlot=static pill */
  "new-convo-screen": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PNewConvoScreen s={s} />
    </div>
  ),

  /* patched copy: design/proto.jsx:433–457 (AddPeopleScreen) — local pool; sel=[0,1] */
  "add-people-screen": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PAddPeopleScreen s={s} />
    </div>
  ),

  /* patched copy: design/proto.jsx:398–431 (AddContactScreen) — one adaptive button; app TTL options */
  "add-contact-screen": (s) => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PAddContactScreen s={s} />
    </div>
  ),

  /* patched copy: design/proto.jsx:537–548 (WelcomeScreen) — buttons via PButton (decision A);
     MuteLink row: proto renders one big button; app splits into static text + accent button —
     visually identical (same colors/font; only the tap target differs). */
  "welcome-screen": (s) => {
    const c = s.c;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <AuthShell s={s}>
          <ArcanMark s={s} size={64} stacked />
          <div style={{ font: `400 11.5px/1.5 ${s.body}`, color: c.text2, textAlign: 'center', marginTop: -4 }}>
            {'// local-first · end-to-end encrypted'}
          </div>
          <div style={{ height: 8 }} />
          <PButton s={s} primary full label="create account" onClick={() => {}} />
          <PButton s={s} full label="restore from recovery code" onClick={() => {}} />
          {/* proto:546 — flex row + explicit font on button locks button strut to 10.5px×1
              matching the app's text-ui-sub leading-none button (avoids strut mismatch) */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 2 }}>
            <span style={{ font: `400 10.5px/1 ${s.body}`, color: c.dim }}>already on a device? </span>
            <button style={{ font: `400 10.5px/1 ${s.body}`, padding: 0, margin: 0, cursor: 'pointer', border: 'none', background: 'transparent' }} onClick={() => {}}>
              <span style={{ font: `400 10.5px/1 ${s.body}`, color: c.accent }}>sign in</span>
            </button>
          </div>
        </AuthShell>
      </div>
    );
  },

  /* patched copy: design/proto.jsx:550–565 (SignInScreen) — buttons via PButton (decision A);
     AuthField=display div matching app AuthField empty input (38px/12px/placeholder in c.dim).
     Empty PHeader back arrow rendered (onBack present in app cell). */
  "sign-in-screen": (s) => {
    const c = s.c;
    /* local helper: display-only field matching app AuthField with empty value (placeholder-only).
       38px height + 12px body font + label at caps-9px matches AuthField's visual.
       Parity note: placeholder rendered as a span in c.dim; real input placeholder may diverge
       by ≤0.2% — characterize maxDiffRatio override per-cell only if threshold is breached. */
    function PAField({ label, ph }) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {label && (
            <span style={{ font: `600 9px/1 ${s.font}`, letterSpacing: '.14em', textTransform: 'uppercase', color: c.dim }}>
              {label}
            </span>
          )}
          <div style={{ height: 38, borderRadius: 12, border: `1px solid ${c.border}`, background: c.panel, display: 'flex', alignItems: 'center', padding: '0 12px' }}>
            <span style={{ font: `400 12px/1 ${s.body}`, color: c.dim }}>{ph}</span>
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* proto:554 — PHeader with back arrow; title="" */}
        <PHeader s={s} title="" onBack={() => {}} />
        <AuthShell s={s}>
          {/* proto:556 */}
          <ArcanMark s={s} size={56} stacked />
          {/* proto:557 — "sign in" title (700 19px/1.2 headMono → mono) */}
          <div style={{ font: `700 19px/1.25 ${s.headMono ? s.font : s.body}`, color: c.text, textAlign: 'center', letterSpacing: '-0.01em' }}>sign in</div>
          {/* proto:558–559 — email + password fields */}
          <PAField label="email" ph="you@domain.dev" />
          <PAField label="password" ph="••••••••" />
          {/* proto:560 — h:4 spacer */}
          <div style={{ height: 4 }} />
          {/* proto:561 — primary submit button */}
          <PButton s={s} primary full label="sign in" onClick={() => {}} />
          {/* proto:562 — footer: forgot + create account */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button style={tapBtn} onClick={() => {}}>
              <span style={{ font: `400 10.5px/1 ${s.body}`, color: c.dim }}>forgot password?</span>
            </button>
            <button style={tapBtn} onClick={() => {}}>
              <span style={{ font: `400 10.5px/1 ${s.body}`, color: c.accent }}>create account</span>
            </button>
          </div>
        </AuthShell>
      </div>
    );
  },
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
