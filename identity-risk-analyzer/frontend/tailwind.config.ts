import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Design tokens. Every color is a CSS variable (src/index.css) so the dark and light themes swap in one place.
// The type scale, radii and easing REPLACE Tailwind's defaults on purpose: ad-hoc sizes simply don't exist.
const rgb = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    fontFamily: {
      sans: ['"Inter Variable"', "Inter", "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
      mono: ['"JetBrains Mono"', "ui-monospace", "Consolas", "monospace"],
      // headings only; full Cyrillic incl. Kazakh (cyrillic-ext)
      serif: ['"Noto Serif Display Variable"', '"Noto Serif Display"', "Georgia", '"Times New Roman"', "serif"],
    },
    // 12 / 13 / 14 / 16 / 20 / 28 / 40 / 56 — the only sizes in the product.
    fontSize: {
      "12": ["12px", { lineHeight: "16px" }],
      "13": ["13px", { lineHeight: "18px" }],
      "14": ["14px", { lineHeight: "20px" }],
      "16": ["16px", { lineHeight: "24px" }],
      "20": ["20px", { lineHeight: "28px", letterSpacing: "-0.01em" }],
      "28": ["28px", { lineHeight: "34px", letterSpacing: "-0.02em" }],
      "40": ["40px", { lineHeight: "46px", letterSpacing: "-0.025em" }],
      "56": ["56px", { lineHeight: "56px", letterSpacing: "-0.035em" }],
    },
    // Two surface radii (cards 14, controls 8) + 4px for data-mark ends.
    borderRadius: { none: "0", sm: "4px", inner: "6px", control: "8px", card: "14px", full: "9999px" }, // inner = control inside a padded control
    extend: {
      colors: {
        base: rgb("base"), // page
        raised: rgb("raised"), // panels
        overlay: rgb("overlay"), // popovers, sheets, menus
        fg: { DEFAULT: rgb("fg"), 2: rgb("fg-2"), 3: rgb("fg-3") }, // text: primary / secondary / muted
        line: { DEFAULT: "var(--line)", strong: "var(--line-strong)" }, // hairlines
        accent: { DEFAULT: rgb("accent"), fg: rgb("accent-fg") }, // ONLY: primary action, active nav, focus
        brand: rgb("brand"), // decoration only: kicker dots, step numerals, wordmark — never data
        // Risk semantics — data only, always paired with a label/icon. Validated per theme (dataviz validator).
        risk: { critical: rgb("risk-critical"), high: rgb("risk-high"), medium: rgb("risk-medium"), low: rgb("risk-low") },
      },
      boxShadow: {
        panel: "var(--panel-shadow)",
        overlay: "var(--overlay-shadow)",
      },
      transitionTimingFunction: { out: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      transitionDuration: { fast: "150ms", base: "220ms", slow: "300ms" },
      keyframes: {
        shimmer: { from: { backgroundPosition: "200% 0" }, to: { backgroundPosition: "-200% 0" } },
        sweep: { to: { transform: "rotate(360deg)" } },
        // a blip flares when the sweep passes it, then fades (delay set per blip from its angle)
        blip: { "0%": { opacity: "1", transform: "scale(1.35)" }, "18%": { opacity: "0.9", transform: "scale(1)" }, "100%": { opacity: "0.35", transform: "scale(1)" } },
        progress: { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(250%)" } },
      },
      animation: {
        shimmer: "shimmer 1.8s linear infinite",
        sweep: "sweep 8s linear infinite",
        blip: "blip 8s linear infinite",
        progress: "progress 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
