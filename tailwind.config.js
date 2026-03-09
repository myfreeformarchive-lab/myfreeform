/** @type {import('tailwindcss').Config} */
module.exports = {
  // ✅ CONTENT: Scan HTML and JavaScript files for Tailwind classes
  // This tells Tailwind which files to analyze for utility class usage.
  // Only classes found here will be included in the final CSS build (tree-shaking).
  content: ["./index.html", "./app.js"],

  // ✅ SAFELIST: Explicitly include classes that aren't detected in content scans
  // Useful for dynamic classes (e.g., generated via JavaScript) or rarely used utilities.
  // Prevents purging of critical classes during production builds.
  safelist: [
    // Size utilities for dynamic elements (e.g., profile images, icons)
    "w-12", "h-12", "w-16", "h-16", "w-[68px]", "h-[68px]", 
    "w-[72px]", "h-[72px]", "w-[76px]", "h-[76px]", "w-20", 
    "h-20", "w-24", "h-24", "w-32", "h-32",
    // Animation patterns: Ensures pulse and shake animations are always available
    { pattern: /pulse/ },
    { pattern: /shake/ }
  ],

  theme: {
    extend: {
      // ✅ FONT FAMILY: Define custom font stacks for the design system
      // Maps logical names (sans, serif) to actual fonts, with fallbacks.
      // Used in HTML classes like font-sans, font-hand for consistent typography.
      fontFamily: { 
        sans: ['Inter', 'sans-serif'],        // Clean, modern sans-serif for body text
        serif: ['Playfair Display', 'serif'], // Elegant serif for headings
        mono: ['Roboto Mono', 'monospace'],   // Monospaced for code or timestamps
        hand: ['Dancing Script', 'cursive']   // Handwritten style for emphasis
      },

      // ✅ COLORS: Brand color palette
      // Defines reusable color tokens (e.g., text-brand-500, bg-brand-600).
      // Centralizes brand identity to ensure consistency across the app.
      colors: { 
        brand: { 
          500: '#9D60FF',  // Primary brand color (e.g., buttons, links)
          600: '#7C00F0'   // Darker variant for hovers/actives
        } 
      },

      // ✅ KEYFRAMES: Custom animation definitions
      // Defines the behavior of animations (e.g., fade in/out for pulse, side-to-side for shake).
      // Browser renders these as CSS keyframes for smooth transitions.
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },    // Fully visible at start/end
          '50%': { opacity: '0.5' }        // Half-transparent in middle
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },  // No movement at start/end
          '25%': { transform: 'translateX(-5px)' },    // Shake left
          '75%': { transform: 'translateX(5px)' }     // Shake right
        }
      },

      // ✅ ANIMATION: Map keyframes to reusable animation classes
      // Allows using animate-pulse or animate-shake in HTML.
      // Controls timing and repetition for browser rendering.
      animation: {
        pulse: 'pulse 1.5s infinite',  // Slow, endless fade for loading states
        shake: 'shake 0.5s'            // Quick shake for errors/feedback
      }
    }
  },

  // ✅ PLUGINS: Array for Tailwind plugins (e.g., for forms, typography)
  // Currently empty; add plugins here if needed for extended functionality.
  plugins: [],
}
