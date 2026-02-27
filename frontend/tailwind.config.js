/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // Enable dark mode with class strategy
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'toast-in': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'toast-in': 'toast-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
