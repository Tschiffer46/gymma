/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Håll dessa i synk med lib/theme.ts — samma värden, två konsumenter
        // (Tailwind-klasser respektive inline-style/ikonfärger).
        bg: "#131316",
        card: "#1d1d22",
        "card-hi": "#26262d",
        ink: "#f2f1ee",
        muted: "#8f8c86",
        line: "#31313a",
        chip: "#26262d",
        "chip-fg": "#b3afa8",
        accent: "#f0603c",
        "accent-dark": "#c94a2b",
        "accent-soft": "#3a2019",
        ok: "#4ea87a",
        danger: "#e0524a",
        "muted-dim": "#6d6a65",
      },
      borderRadius: {
        // Håll i synk med `radius` i lib/theme.ts.
        sm: "12px",
        md: "16px",
        lg: "18px",
        xl: "20px",
      },
    },
  },
  plugins: [],
};
