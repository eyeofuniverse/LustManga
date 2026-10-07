import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0b10",
        surface: "#15151e",
        "surface-2": "#1f1f2c",
        line: "rgba(255,255,255,0.08)",
        accent: "#ff3d7f",
      },
    },
  },
  plugins: [],
} satisfies Config;
