import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', "sans-serif"],
        display: ['"Cabinet Grotesk"', '"IBM Plex Sans"', "sans-serif"],
      },
      colors: {
        primary: {
          50: "#EBF3FF",
          100: "#D6E7FF",
          200: "#ADD0FF",
          300: "#85B8FF",
          400: "#5CA1FF",
          500: "#0066FF",
          600: "#0052CC",
          700: "#003D99",
          800: "#002966",
          900: "#001433",
          950: "#000A1A",
        },
        accent: {
          50: "#E6FBFF",
          100: "#CCF7FF",
          200: "#99EEFF",
          300: "#66E6FF",
          400: "#33DDFF",
          500: "#00D4FF",
          600: "#00AACC",
          700: "#007F99",
          800: "#005566",
          900: "#002A33",
        },
        neutral: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
          950: "#020617",
        },
        success: {
          50: "#E8FAF0",
          500: "#00C853",
          600: "#00A344",
          700: "#007D35",
        },
        warning: {
          50: "#FFF8E6",
          500: "#FFB300",
          600: "#CC8F00",
          700: "#996B00",
        },
        error: {
          50: "#FFF0EC",
          500: "#FF3D00",
          600: "#CC3100",
          700: "#992500",
        },
      },
      borderRadius: {
        card: "12px",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(15, 23, 42, 0.08), 0 1px 2px -1px rgba(15, 23, 42, 0.04)",
        "card-hover":
          "0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)",
        elevated:
          "0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.04)",
      },
      zIndex: {
        dropdown: "100",
        modal: "200",
        toast: "300",
        tooltip: "400",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "skeleton-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "spin-slow": "spin-slow 1s linear infinite",
        "skeleton-pulse": "skeleton-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};

export default config;
