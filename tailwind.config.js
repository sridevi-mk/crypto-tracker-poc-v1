/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./providers/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#101828",
        mist: "#475467",
        panel: "#ffffff",
        border: "#e4e7ec",
        glow: "#f2f4f7",
      },
      boxShadow: {
        panel: "0 10px 24px rgba(16, 24, 40, 0.08)",
      },
    },
  },
  plugins: [],
};
