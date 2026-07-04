// src/ui/kit/pfield.tsx — port of design/proto-ui.jsx lines 108–118.
// Display-only field with optional label, placeholder, value, mono mode.
// No input element — YAGNI; an interactive variant is a Wave concern.
//
// Strut note (Task 7 rule): the outer flex-column div contains a blockified
// span flex item whose IFC strut derives from the span's own computed font
// (text-ui-caps 9px/1 = 9px). To ensure any cross-browser IFC strut resolution
// aligns with the prototype's ambient context (body 16px/normal ≈ 1.125),
// pin the outer div to that context — same treatment as PSectionLabel.

export function PField({
  label,
  ph,
  value,
  mono,
}: {
  label?: string;
  ph?: string;
  value?: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div
      className="flex flex-col gap-1.5"
      style={{ fontSize: 16, lineHeight: "1.125" }}
    >
      {label && (
        <span className="font-mono font-semibold text-ui-caps tracking-caps-sm uppercase text-dim">
          {label}
        </span>
      )}
      <div className="h-10 rounded-r-4 border border-hairline bg-panel flex items-center px-3">
        <span
          className={[
            "text-ui-row leading-none",
            mono ? "font-mono" : "font-body",
            value ? "text-text" : "text-dim",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {value ?? ph}
        </span>
      </div>
    </div>
  );
}
