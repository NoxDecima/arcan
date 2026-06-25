import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * Arcan-tokenized text input. Replaces the inline
 * `bg-background border …` markup used by ad-hoc modals. Uses the same
 * font, radius, and focus ring as the rest of the design system.
 *
 * Why this exists: shadcn's `bg-background` / `border` (no color) /
 * `text-muted-foreground` utilities all flow through the HSL shim in
 * src/index.css. Modal callsites that used them rendered light-bg inputs
 * over dark surfaces (audit headline #2). TextField sidesteps the shim
 * entirely and uses Arcan tokens that follow data-theme correctly.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-r-4 border border-hairline bg-bg px-3 py-2 text-sm text-text",
        "placeholder:text-dim",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:border-arcan-accent",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
TextField.displayName = "TextField";
