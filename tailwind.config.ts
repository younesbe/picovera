import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        pv: {
          green:         '#1D9E75',
          'green-mid':   '#5DCAA5',
          'green-light': '#E1F5EE',
          'green-dark':  '#085041',
          amber:         '#BA7517',
          'amber-light': '#FAEEDA',
          red:           '#E24B4A',
          'red-light':   '#FCEBEB',
        },
        surface: {
          base:         '#0A0A09',
          raised:       '#111110',
          overlay:      '#191918',
          border:       '#252522',
          'border-mid': '#333330',
        },
      },
      fontFamily: {
        display: ['DM Serif Display', 'Georgia', 'serif'],
        sans:    ['DM Sans', 'system-ui', 'sans-serif'],
        mono:    ['DM Mono', 'Fira Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      animation: {
        'fade-up':     'fadeUp 0.5s ease forwards',
        'pulse-green': 'pulseGreen 2s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGreen: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
      },
    },
  },
  plugins: [],
}

export default config
