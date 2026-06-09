import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-r-3 font-body font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary (previously "default") — uses the user-picked arcan-accent
        default:     "bg-arcan-accent text-on-accent hover:opacity-90",
        primary:     "bg-arcan-accent text-on-accent hover:opacity-90",
        outline:     "bg-transparent text-text border border-hairline hover:bg-panel-2",
        ghost:       "bg-transparent text-text-2 hover:bg-panel-2",
        // Danger (previously "destructive")
        destructive: "bg-transparent text-red border border-red/40 hover:bg-red/10",
        danger:      "bg-transparent text-red border border-red/40 hover:bg-red/10",
        // Secondary + link kept for backward compat
        secondary:   "bg-panel-2 text-text hover:bg-panel-2/80",
        link:        "text-text-2 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 text-sm",
        sm:      "h-8 px-3 text-xs",
        md:      "h-10 px-4 text-sm",
        lg:      "h-11 px-5 text-base",
        icon:    "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
