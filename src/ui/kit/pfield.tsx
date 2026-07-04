// src/ui/kit/pfield.tsx — port of design/proto-ui.jsx lines 108–118.
// Display-only field with optional label, placeholder, value, mono mode.
// No input element — YAGNI; an interactive variant is a Wave concern.
//
// No strut pin here (unlike PSectionLabel): a flex container establishes no
// inline formatting context, and both spans set their own font explicitly,
// so ambient font context cannot leak into this component's geometry.

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
    <div className="flex flex-col gap-1.5">
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
