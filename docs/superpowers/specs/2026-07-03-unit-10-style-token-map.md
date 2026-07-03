# Unit 10 — Style→Token Mapping Table

Law for all Unit 10 transliteration work. Every inline style in
`design/proto.jsx`, `design/proto-ui.jsx`, and `design/hf-*.jsx` maps to a
token utility via this table. **If a style has no mapping: stop, extend this
table (and tokens.css/tailwind.config if needed), then continue. Never
approximate inline.**

Prototype context: v5 skin — `fam: noir`, `headMono: true`, `radius: 12`,
`bubbleRadius: 14`, `avatarRadius: 10`, `soft: true` (pill buttons),
`ownStyle: tint` (`ownTint` dark .30 / light .20), `sysComment: true`
(`// ` prefixes), `stars: true`.

## skin() fields → tokens

| Prototype (`s.c.*` / `s.*`) | Token / utility |
|---|---|
| `c.bg` | `bg-bg` |
| `c.stage` | `bg-bg-stage` |
| `c.panel` | `bg-panel` |
| `c.panel2` | `bg-panel-2` |
| `c.rail` | `bg-rail` |
| `c.border` | `border-hairline` (bg: `bg-hairline` for 1px rules) |
| `c.text` | `text-text` |
| `c.text2` | `text-text-2` |
| `c.dim` | `text-dim` |
| `c.green` / `c.red` / `c.amber` | `text-green` / `text-red` / `text-amber` (bg- variants likewise) |
| `c.accent` (text-safe) | `text-arcan-accent` |
| `c.accentFill` | `bg-arcan-accent-fill` |
| `c.accentGrad` | `bg-gradient-primary` |
| `c.accentSoft` | `bg-accent-soft` |
| `c.accentBorder` | `border-accent-border` |
| `c.onAccent` | `text-on-accent` |
| `alpha(c.accentFill, ownTint)` | `bg-bubble-own` |
| `alpha(c.red, .5)` (danger border) | `border-red-border` |
| `alpha('#fff', .18)` (attachment veil) | `bg-media-veil` |
| HAv group tint `alpha(#bb9af7/#7a55c9, …)` | `bg-avatar-group` |
| Fab glow `alpha(c.accentFill, .45)` | `shadow-fab` |
| cosmic dot glow `alpha(c.accentFill, .6)` | `shadow-dot` (dot itself `bg-arcan-accent-fill`) |
| fixed violet dot `#bb9af7`/`#7a55c9` | `bg-cosmic-dot` / HAv group fg `text-avatar-group-fg` |
| toast washes `alpha(col, .2/.14)` | `bg-{green,red,neutral,accent}-wash` |
| toast shadow | `shadow-toast` |
| DesktopWindow shadow | `shadow-window` |
| `s.font` (JetBrains Mono) | `font-mono` |
| `s.body` (Inter) | `font-body` |
| `s.radius` (12) | `rounded-r-4` |
| `s.radius + 2` (14, cards) | `rounded-r-5` |
| `s.bubbleRadius` (14) | `rounded-r-5` |
| bubble tail corner `max(2, bubbleRadius-12)` (2) | `rounded-*-r-1` on the tail corner |
| `s.avatarRadius` (10) | `rounded-avatar` |
| profile avatar (radius+6 ≈ 18) | `rounded-avatar-lg` |
| `s.soft ? 999 : radius` (buttons) | `rounded-pill` |
| toggle/knob 999 | `rounded-pill` |

## Type ramp (font shorthand → utilities)

| Prototype `font:` shorthand | Utilities |
|---|---|
| `700 16px/1.2` + headMono | `font-mono font-bold text-ui-title tracking-title` |
| `600 13px/1` + headMono (buttons) | `font-mono font-semibold text-ui-btn` |
| `500 12.5px/1.2` body (row labels) | `font-body font-medium text-ui-row` |
| `400 12.5px/1.45` body (bubble text) | `font-body text-ui-bubble` |
| `400 12.5px/1` (field value) | `font-body text-ui-row leading-none` |
| `400 11px/1` mono (row values) | `font-mono text-ui-value` |
| `400 10.5px/1.2` body (row subs) | `font-body text-ui-sub` |
| `400 10px/1.4` mono (sys rows) | `font-mono text-ui-sys` |
| `500|600 9.5px/1` (tab labels) | `font-mono font-medium|font-semibold text-ui-tab tracking-tab` |
| `600 9px/1` mono `.16em` caps (section labels) | `font-mono font-semibold text-ui-caps tracking-caps uppercase` |
| `600 9px/1` mono `.14em` caps (field labels) | `font-mono font-semibold text-ui-caps tracking-caps-sm uppercase` |
| `500 8.5px/1` mono (bubble time) | `font-mono font-medium text-ui-time` |
| `500 12px/1.3` body (toast text) | `font-body font-medium text-ui-toast` |
| `600 15px/1.3` mono (empty-state title) | `font-mono font-semibold text-ui-empty` |
| `400 11.5px/1` body (empty-state sub) | `font-body text-ui-empty-sub` |
| `500 10px/1` mono `.04em` (window chrome) | `font-mono font-medium text-ui-chrome tracking-tab` |
| `600 size*.34px/1` mono `-.02em` (HAv initials) | `font-mono font-semibold tracking-avatar` + computed inline font-size |

## Recurring clusters (copy these verbatim in kit/screen ports)

| Cluster | Utility string |
|---|---|
| PCard | `rounded-r-5 border border-hairline bg-panel overflow-hidden` |
| PField box (h 40) | `h-10 rounded-r-4 border border-hairline bg-panel flex items-center px-3` |
| PButton base (h 44) | `h-11 rounded-pill font-mono font-semibold text-ui-btn` |
| PButton primary | `bg-arcan-accent-fill text-on-accent` |
| PButton danger | `bg-transparent text-red border border-red-border` |
| PButton outline | `bg-transparent text-text border border-hairline` |
| PButton ghost | `bg-transparent text-text-2` |
| PToggle track on/off | `bg-arcan-accent-fill` / `bg-panel-2 border border-hairline`; knob transition `duration-switch` |
| PHeader bar (minH 52) | `min-h-[52px] flex items-center gap-[11px] px-3 border-b border-hairline bg-bg` |
| PTabBar (h 54) | `h-[54px] flex items-stretch border-t border-hairline bg-bg` |
| Bubble (own, v5 tint) | `bg-bubble-own border border-accent-border text-text rounded-r-5` + tail `rounded-br-r-1` |
| Bubble (theirs) | `bg-panel border border-hairline text-text rounded-r-5 shadow-bubble` + tail `rounded-bl-r-1` |
| Attachment placeholder (own / theirs) | `bg-media-veil` / `bg-rail`, radius `rounded-[8px]` (max(3, bubbleRadius−6)) |
| Sys row | `font-mono text-ui-sys text-dim text-center` with literal `// ` prefix |
| "new" divider | lines `bg-arcan-accent opacity-50`, label `font-mono font-semibold text-ui-caps tracking-caps uppercase text-arcan-accent` |
| Section label | `font-mono font-semibold text-ui-caps tracking-caps uppercase text-dim` with literal `// ` prefix |

## Component metrics stay literal

Fixed px dimensions that are structure, not skin, stay as literals in kit
code (arbitrary values allowed; `check-tokens` only polices color/typography):
header minH 52, tab bar h 54, button h 44, field h 40, toggle 38×22 (knob 16,
offsets 2/18), avatar default 34, icon sizes 15/16/17/20, row padding
`12px 14px`, header padding `0 12px`, bubble padding `8px 11px` (attachment
`6`), QR module grid (5×5, gap 3, 62% of box). Fab 52 (offset right/bottom 16), toast icon circle 22, DesktopWindow bar h 38 / traffic lights 11 (#e2696e #e6b450 #5fb87f — decorative constants, stay inline), phone-frame numbers are stage dressing (not ported), fab shadow geometry 0 8px 22px (proto:148), dot glow 0 0 10px (proto:574), toast/window shadow geometry in their --shadow-* tokens.

## Legacy tokens (not in the prototype — do not use in new kit code)

`--color-faint`, `--shadow-glow-accent`, `--fs-hero/display/h1/h2/h3`,
`--tracking-caps-lg`, `--r-0/1/2/3` (r-1 only as bubble tail), shadcn HSL
variables. They die with the old components in Phase 4 or remain for brand
surfaces only.
