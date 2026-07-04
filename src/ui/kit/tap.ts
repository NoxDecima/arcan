// src/ui/kit/tap.ts — tapBtn reset as a shared Tailwind class string.
// Port of design/proto-ui.jsx line 42 (tapBtn inline style object).
// Use via className on <button> elements that need the base interactive reset.

export const tapClass =
  "border-none bg-transparent p-0 m-0 cursor-pointer flex items-center [-webkit-tap-highlight-color:transparent]";
