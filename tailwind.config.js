/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cyan: { 100: '#e2e8ee', 200: '#d3dde6', 300: '#bccbd9', 400: '#98adbf', 500: '#788fa4', 600: '#5d7285', 700: '#435665', 800: '#2b3945', 900: '#1a242c' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: 'none',
        ember: 'none',
      },
    },
  },
  plugins: [],
};
