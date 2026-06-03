import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Clean emerald green accent, tuned for dark UI (Tailwind emerald scale).
        brand: {
          DEFAULT: "#22c55e",
          50: "#ecfdf3",
          100: "#d1fadf",
          200: "#a6f4c5",
          300: "#6ceba3",
          400: "#3ddc84",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        ink: {
          900: "#0b0f14",
          800: "#11161d",
          700: "#161c24",
          600: "#1d2530",
          500: "#27313d",
          400: "#3a4654",
          300: "#586574",
          200: "#8b97a5",
          100: "#c2cad3",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
