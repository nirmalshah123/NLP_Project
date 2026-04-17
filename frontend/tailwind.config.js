/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "Segoe UI", "sans-serif"],
      },
      colors: {
        brand: {
          magenta: "#c026d3",
          purple: "#7c3aed",
          pink: "#db2777",
        },
        accent: {
          orange: "#ff6b35",
          "orange-hover": "#ff8555",
          charcoal: "#1a1817",
        },
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(135deg, #ee2a7b 0%, #b91c8c 35%, #8e2de2 100%)",
        "brand-gradient-subtle":
          "linear-gradient(135deg, rgba(238, 42, 123, 0.28) 0%, rgba(142, 45, 226, 0.22) 100%)",
        "glow-radial":
          "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(192, 38, 211, 0.35), transparent 55%)",
      },
      boxShadow: {
        glow: "0 0 60px -12px rgba(192, 38, 211, 0.45)",
        "glow-sm": "0 0 40px -8px rgba(124, 58, 237, 0.35)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};
