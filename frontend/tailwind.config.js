/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        green: "#10b981",
        red: "#ef4444",
        bg: "#0a0a0a",
        text: "#e5e5e5",
        // Muted text bumped to ~5.6:1 contrast on #0a0a0a for WCAG AA.
        neutral: "#8b8b8b",
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "Geist Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
