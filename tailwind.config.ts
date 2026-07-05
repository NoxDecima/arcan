import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./tests/parity/app-gallery/**/*.{ts,tsx}"],
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
        'arcan-accent-fill': 'var(--color-accent-fill)',
        'bubble-own': 'var(--color-bubble-own)',
        'avatar-group': 'var(--color-avatar-group)',
        'red-border': 'var(--color-red-border)',
        'media-veil': 'var(--color-media-veil)',
        'avatar-group-fg': 'var(--color-avatar-group-fg)',
        'cosmic-dot': 'var(--color-cosmic-dot)',
        'cosmic-dot-2': 'var(--color-cosmic-dot-2)',
        'green-wash': 'var(--color-green-wash)',
        'red-wash': 'var(--color-red-wash)',
        'neutral-wash': 'var(--color-neutral-wash)',
        'accent-wash': 'var(--color-accent-wash)',
      },
      fontFamily: {
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
        display: ['var(--font-display)'],
      },
      backgroundColor: {
        // Wave D — warn callout (hf-flows:108-110)
        'warn': 'var(--color-warn-bg)',
      },
      borderColor: {
        // Wave D — warn callout
        'warn': 'var(--color-warn-border)',
      },
      textColor: {
        // Wave D — warn callout
        'warn': 'var(--color-warn-text)',
        'warn-icon': 'var(--color-warn-icon)',
      },
      fontSize: {
        'ui-title': ['var(--fs-ui-title)', { lineHeight: 'var(--lh-ui)' }],
        'ui-btn': ['var(--fs-ui-btn)', { lineHeight: '1' }],
        'ui-row': ['var(--fs-ui-row)', { lineHeight: 'var(--lh-ui)' }],
        'ui-bubble': ['var(--fs-ui-row)', { lineHeight: 'var(--lh-bubble)' }],
        'ui-value': ['var(--fs-ui-value)', { lineHeight: '1' }],
        'ui-sub': ['var(--fs-ui-sub)', { lineHeight: 'var(--lh-ui)' }],
        'ui-sys': ['var(--fs-ui-sys)', { lineHeight: '1.4' }],
        'ui-tab': ['var(--fs-ui-tab)', { lineHeight: '1' }],
        'ui-caps': ['var(--fs-ui-caps)', { lineHeight: '1' }],
        'ui-time': ['var(--fs-ui-time)', { lineHeight: '1' }],
        'ui-toast': ['var(--fs-ui-toast)', { lineHeight: '1.3' }],
        'ui-empty': ['var(--fs-ui-empty)', { lineHeight: '1.3' }],
        'ui-empty-sub': ['var(--fs-ui-empty-sub)', { lineHeight: '1' }],
        'ui-chrome': ['var(--fs-ui-chrome)', { lineHeight: '1' }],
        'ui-nav': ['var(--fs-ui-nav)', { lineHeight: 'var(--lh-ui)' }],
        'ui-preview': ['var(--fs-ui-value)', { lineHeight: '1.3' }],   // row preview 11px/1.3 (proto:752)
        'ui-contact': ['var(--fs-ui-btn)', { lineHeight: 'var(--lh-ui)' }], // ContactRow name 13px/1.2 (proto:139)
        'ui-chatsub': ['var(--fs-ui-sys)', { lineHeight: '1' }],
        // Wave C — settings cluster
        'ui-name': ['var(--fs-ui-name)', { lineHeight: 'var(--lh-ui)' }],       // profile display name 19px/1.2
        'ui-heading': ['var(--fs-ui-heading)', { lineHeight: 'var(--lh-ui)' }], // add-contact heading / group name 18px/1.2
        // Wave D — auth + flows
        'ui-req': ['var(--fs-ui-req)', { lineHeight: 'var(--lh-ui)' }],         // ContactRequest name 17px/1.2 (hf-flows:238)
      },
      letterSpacing: {
        caps: 'var(--tracking-caps)',
        'caps-sm': 'var(--tracking-caps-sm)',
        'caps-lg': 'var(--tracking-caps-lg)',
        tab: 'var(--tracking-tab)',
        avatar: 'var(--tracking-avatar)',
        title: 'var(--tracking-title)',
        // Wave C — settings cluster caps tracking
        'caps-12': 'var(--tracking-caps-12)',
        'caps-10': 'var(--tracking-caps-10)',
        'caps-08': 'var(--tracking-caps-08)',
      },
      transitionDuration: {
        switch: 'var(--dur-switch)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        'r-0': '0px',
        'r-1': 'var(--r-1)',
        'r-2': 'var(--r-2)',
        'r-3': 'var(--r-3)',
        'r-4': 'var(--r-4)',
        'r-5': 'var(--r-5)',
        'avatar': 'var(--r-avatar)',
        'avatar-lg': 'var(--r-avatar-lg)',
        pill: 'var(--r-pill)',
      },
      boxShadow: {
        'level-1': 'var(--shadow-1)',
        'level-2': 'var(--shadow-2)',
        'bubble': 'var(--shadow-bubble)',
        'toast': 'var(--shadow-toast)',
        'window': 'var(--shadow-window)',
        'fab': '0 8px 22px var(--color-accent-glow)',
        'dot': '0 0 10px var(--color-accent-dot)',
      },
      keyframes: {
        // loading-affordance dot for LinkDeviceScreen (port of hf-typing keyframe).
        // Parity galleries freeze animation (animation:none!important) so the dot
        // renders at its base state (opacity:1) on both sides.
        'waiting-pulse': {
          '0%, 70%, 100%': { transform: 'translateY(0)', opacity: '0.35' },
          '35%': { transform: 'translateY(-3px)', opacity: '1' },
        },
      },
      animation: {
        'waiting-pulse': 'waiting-pulse 1.1s ease-in-out infinite',
      },
      backgroundImage: {
        // Gradient tokens — see src/styles/tokens.css.
        // Usage: <div className="bg-gradient-primary"> etc.
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-rule': 'var(--gradient-rule)',
        'gradient-cosmic': 'var(--gradient-cosmic)',
      },
    },
  },
  plugins: [],
} satisfies Config;
