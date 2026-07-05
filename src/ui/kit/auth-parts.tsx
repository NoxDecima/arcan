// src/ui/kit/auth-parts.tsx — ports of design/hf-flows.jsx helpers:
// Steps (31–34), Title→AuthTitle (35–37), Sub→AuthSub (38–40),
// MuteLink (61–63), Field→AuthField (41–51, interactive variant).
// Purity: no Jazz, no router, no @/components.

import type { ReactNode, KeyboardEvent } from "react";
import type { JSX } from "react";

// ── Steps ────────────────────────────────────────────────────────────────────
// Port of hf-flows.jsx:31-34.
// Renders `of` dash pills; first `n` filled with accent, rest panel-2.
export function Steps({ n, of: total = 4 }: { n: number; of?: number }): JSX.Element {
  return (
    <div className="flex justify-center gap-[5px] mb-0.5" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={[
            "h-1 w-[22px] rounded-r-1",
            i < n ? "bg-arcan-accent" : "bg-panel-2",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

// ── AuthTitle ─────────────────────────────────────────────────────────────────
// Port of hf-flows.jsx:35-37 (700 19px/1.25 mono -.01em).
export function AuthTitle({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="text-center text-text font-mono font-bold text-ui-name leading-tight tracking-[-0.01em]">
      {children}
    </div>
  );
}

// ── AuthSub ───────────────────────────────────────────────────────────────────
// Port of hf-flows.jsx:38-40 (400 11.5px/1.5 body, marginTop:-8 → -mt-2).
export function AuthSub({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="text-center text-text-2 -mt-2 font-body text-ui-empty-sub leading-normal">
      {children}
    </div>
  );
}

// ── MuteLink ──────────────────────────────────────────────────────────────────
// Port of hf-flows.jsx:61-63 (400 10.5px/1 body).
// Interactive wrapping (<button className={tapClass}>) is the presenter's job.
export function MuteLink({
  accent,
  children,
}: {
  accent?: boolean;
  children: ReactNode;
}): JSX.Element {
  return (
    <span
      className={[
        "font-body text-ui-sub leading-none",
        accent ? "text-arcan-accent" : "text-dim",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

// ── AuthField ─────────────────────────────────────────────────────────────────
// Interactive input (hf Field is display-only; the app needs real inputs).
// Visual metrics from hf-flows.jsx:41-51.
// Parity note: the empty input renders its placeholder (dim, 12px) in a 38px
// bordered box — same visual intent as hf Field's display placeholder span.
export function AuthField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono = false,
  as = "input",
  rows,
  autoComplete,
  autoFocus,
  required,
  minLength,
  spellCheck,
  onKeyDown,
  id,
  inputTestId,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "password";
  mono?: boolean;
  as?: "input" | "textarea";
  rows?: number;
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
  minLength?: number;
  spellCheck?: boolean;
  onKeyDown?: (e: KeyboardEvent) => void;
  id?: string;
  inputTestId?: string;
}): JSX.Element {
  // Label span: 600 9px/1 mono .14em caps (hf-flows:45)
  const labelSpanClass =
    "font-mono font-semibold text-ui-caps tracking-caps-sm uppercase text-dim";

  return (
    <label className="flex flex-col gap-1.5">
      {label && <span className={labelSpanClass}>{label}</span>}
      {as === "textarea" ? (
        <textarea
          id={id}
          data-testid={inputTestId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          minLength={minLength}
          spellCheck={spellCheck}
          onKeyDown={onKeyDown}
          className="w-full rounded-r-4 border border-hairline bg-panel px-3 py-2 font-mono text-ui-toast text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent"
        />
      ) : (
        <input
          id={id}
          data-testid={inputTestId}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          minLength={minLength}
          spellCheck={spellCheck}
          onKeyDown={onKeyDown}
          className={[
            "h-[38px] rounded-r-4 border border-hairline bg-panel px-3 text-ui-toast leading-none text-text placeholder:text-dim focus:outline-none focus:border-arcan-accent",
            mono ? "font-mono" : "font-body",
          ].join(" ")}
        />
      )}
    </label>
  );
}
