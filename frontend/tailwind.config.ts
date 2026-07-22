import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        nexus: { bg: "#070B14", panel: "rgba(17,24,39,0.55)", cyan: "#38BDF8", teal: "#2DD4BF" },
      },
      fontFamily: {
        mono: ["ui-monospace", "JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
