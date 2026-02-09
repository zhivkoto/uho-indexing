import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Dark theme palette
        bg: {
          primary: "#0a0b0d",
          secondary: "#111318",
          tertiary: "#1a1d24",
          hover: "#22262f",
        },
        border: {
          DEFAULT: "#2a2e38",
          light: "#353a47",
        },
        accent: {
          purple: "#8b5cf6",
          "purple-light": "#a78bfa",
          blue: "#3b82f6",
          green: "#22c55e",
          red: "#ef4444",
          orange: "#f59e0b",
        },
        text: {
          primary: "#f1f5f9",
          secondary: "#94a3b8",
          muted: "#64748b",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
