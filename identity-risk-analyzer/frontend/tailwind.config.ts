import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Every color is a CSS variable (see src/index.css) so light and dark themes swap in one place.
const hsl = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;
const rgb = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem" },
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
        display: ["Unbounded", '"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "Consolas", "monospace"],
      },
      colors: {
        border: hsl("border"),
        input: hsl("input"),
        ring: hsl("ring"),
        background: hsl("background"),
        foreground: hsl("foreground"),
        surface: hsl("surface"),
        inset: hsl("inset"),
        fg: rgb("fg-rgb"), // neutral overlay ink: white on dark, slate on light (bg-fg/5, border-fg/10 ...)
        code: rgb("code-fg"),
        primary: { DEFAULT: hsl("primary"), foreground: hsl("primary-foreground") },
        secondary: { DEFAULT: hsl("secondary"), foreground: hsl("secondary-foreground") },
        muted: { DEFAULT: hsl("muted"), foreground: hsl("muted-foreground") },
        accent: { DEFAULT: hsl("accent"), foreground: hsl("accent-foreground") },
        destructive: { DEFAULT: hsl("destructive"), foreground: hsl("destructive-foreground") },
        popover: { DEFAULT: hsl("popover"), foreground: hsl("popover-foreground") },
        card: { DEFAULT: hsl("card"), foreground: hsl("card-foreground") },
        // Risk levels — marks (fills/strokes). Validated per theme with the dataviz validator; always labelled.
        risk: {
          critical: rgb("risk-critical"),
          high: rgb("risk-high"),
          medium: rgb("risk-medium"),
          low: rgb("risk-low"),
        },
        // Risk levels — text on tinted backgrounds (readable contrast in each theme).
        "risk-fg": {
          critical: rgb("risk-critical-fg"),
          high: rgb("risk-high-fg"),
          medium: rgb("risk-medium-fg"),
          low: rgb("risk-low-fg"),
        },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      keyframes: {
        "radar-sweep": { to: { transform: "rotate(360deg)" } },
        aurora: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(4%, -3%, 0) scale(1.08)" },
        },
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(calc(-50% - 0.5rem))" } },
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
        "ping-slow": { "75%, 100%": { transform: "scale(2.4)", opacity: "0" } },
      },
      animation: {
        "radar-sweep": "radar-sweep 6s linear infinite",
        aurora: "aurora 18s ease-in-out infinite",
        marquee: "marquee 40s linear infinite",
        shimmer: "shimmer 2.2s linear infinite",
        "ping-slow": "ping-slow 2.4s cubic-bezier(0,0,0.2,1) infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
