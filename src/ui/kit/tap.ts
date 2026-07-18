// src/ui/kit/tap.ts — tapBtn reset as a shared Tailwind class string.
// Port of design/proto-ui.jsx line 42 (tapBtn inline style object).
//
// Deliberately OMITS `border-none` and `bg-transparent` from the prototype's
// object: Tailwind preflight already sets border-width:0 / border-style:solid
// and background-color:transparent on <button>, and carrying them as
// utility-layer classes silently defeats composed `border-b`/`bg-*` variants
// (utilities beat preflight; `border-none` sets border-style:none which kills
// a later `border-b`'s 1px width). Composers like PRow add borders on top of
// this reset safely.
//
// Motion (UI motion spec 2026-07-18): tapClass carries the shared
// color-feedback transition (transition-tint duration-fast ease-out) so every
// interactive element built on it animates hover/active color changes
// uniformly. Hover/active COLORS stay per-component. CSS transitions are
// per-element, not inherited — child icons/text needing animated color
// changes must declare their own transition-colors / transition-tint.

export const tapClass =
  "p-0 m-0 cursor-pointer flex items-center [-webkit-tap-highlight-color:transparent] transition-tint duration-fast ease-out disabled:pointer-events-none";
