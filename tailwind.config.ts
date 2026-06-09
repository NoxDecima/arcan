import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // shadcn/ui HSL tokens (kept for existing component compat)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Arcan design token utilities
        bg: 'var(--color-bg)',
        'bg-stage': 'var(--color-bg-stage)',
        panel: 'var(--color-panel)',
        'panel-2': 'var(--color-panel-2)',
        rail: 'var(--color-rail)',
        hairline: 'var(--color-border)',
        text: 'var(--color-text)',
        'text-2': 'var(--color-text-2)',
        dim: 'var(--color-dim)',
        faint: 'var(--color-faint)',
        green: 'var(--color-green)',
        amber: 'var(--color-amber)',
        red: 'var(--color-red)',
        teal: 'var(--color-teal)',
        'arcan-accent': 'var(--color-accent)',
        'accent-soft': 'var(--color-accent-soft)',
        'accent-border': 'var(--color-accent-border)',
        'on-accent': 'var(--color-on-accent)',
      },
      fontFamily: {
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
        display: ['var(--font-display)'],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        'r-0': '0px',
        'r-1': 'var(--r-1)',
        'r-2': 'var(--r-2)',
        'r-3': 'var(--r-3)',
        pill: 'var(--r-pill)',
      },
      boxShadow: {
        'level-1': 'var(--shadow-1)',
        'level-2': 'var(--shadow-2)',
      },
    },
  },
  plugins: [],
} satisfies Config;
