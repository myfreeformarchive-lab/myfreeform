/** @type {import('tailwindcss').Config} */
module.exports = {
  // ✅ Scan HTML and Javascript for Tailwind classes
  content: ["./index.html", "./app.js"],
  safelist: ["w-12", "h-12"],
  theme: {
    extend: {
      fontFamily: { 
        sans: ['Inter', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
        mono: ['Roboto Mono', 'monospace'],
        hand: ['Dancing Script', 'cursive']
      },
      colors: { 
        brand: { 500: '#3f51b5', 600: '#303f9f' } 
      }
    }
  },
  plugins: [],
}
