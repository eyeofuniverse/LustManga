import type { Config } from "tailwindcss";

// Colours are CSS variables (see globals.css) so the whole site themes (dark / light) without a class per element.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        "surface-3": v("surface-3"),
        text: v("text"),
        muted: v("muted"),
        accent: v("accent"),
        "accent-2": v("accent-2"),
        "accent-fill": v("accent-fill"),
        good: v("good"),
        warn: v("warn"),
        bad: v("bad"),
        info: v("info"),
        line: "rgb(var(--text) / 0.09)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-sora)", "var(--font-inter)", "ui-sans-serif", "sans-serif"],
      },
      maxWidth: { content: "1480px" },
      boxShadow: {
        card: "0 1px 0 rgb(var(--text) / 0.04), 0 12px 32px -14px rgb(0 0 0 / 0.55)",
        glow: "0 0 0 1px rgb(var(--accent) / 0.45), 0 16px 48px -12px rgb(var(--accent) / 0.4)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        rise: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "none" } },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
        drawer: { from: { transform: "translateX(-100%)" }, to: { transform: "none" } },
        pop: { from: { opacity: "0", transform: "scale(.96)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        rise: "rise .45s cubic-bezier(.2,.7,.3,1) both",
        fade: "fade .3s ease both",
        pop: "pop .25s cubic-bezier(.2,.8,.3,1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
