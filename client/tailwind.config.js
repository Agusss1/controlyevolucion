/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#070b12', 900: '#0b111c', 850: '#0f1724', 800: '#131d2d', 700: '#1b2840', 600: '#24354f', 500: '#34496a' },
        brass: { 300: '#f0d9a0', 400: '#e2c27a', 500: '#c9a227', 600: '#a8841a' },
        signal: { red: '#e5534b', green: '#3fb950', amber: '#d29922', blue: '#58a6ff' }
      },
      fontFamily: {
        display: ['"Cinzel"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      boxShadow: { panel: '0 10px 40px rgba(0,0,0,0.55)' }
    }
  },
  plugins: []
};
