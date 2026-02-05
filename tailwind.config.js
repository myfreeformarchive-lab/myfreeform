/** @type {import('tailwindcss').Config} */
module.exports = {
  // ✅ Scan HTML and Javascript for Tailwind classes
  content: ["./index.html", "./app.js"],
  safelist: [
    "w-12", "h-12", "w-16", "h-16", "w-[68px]", "h-[68px]", 
    "w-[72px]", "h-[72px]", "w-[76px]", "h-[76px]", "w-20", 
    "h-20", "w-24", "h-24", "w-32", "h-32",
    // Add animation patterns to safelist
    { pattern: /pulse/ },
    { pattern: /shake/ }
  ],
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
      },
      // Add custom animations to Tailwind
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' }
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-5px)' },
          '75%': { transform: 'translateX(5px)' }
        }
      },
      animation: {
        pulse: 'pulse 1.5s infinite',
        shake: 'shake 0.5s'
      }
    }
  },
  plugins: [],
}
