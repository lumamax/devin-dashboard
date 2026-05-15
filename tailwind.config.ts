import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        devin: {
          bg: "#0B0B0F",
          panel: "#15151A",
          border: "#26262E",
          accent: "#6EE7B7",
          accentMuted: "#3E8E78",
          text: "#E5E7EB",
          textMuted: "#9CA3AF",
          danger: "#F87171",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
