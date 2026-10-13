/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Hiragino Kaku Gothic ProN"', '"Noto Sans JP"', 'Meiryo', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
