/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        privacy: {
          green: '#059669',
          light: '#ecfdf5',
          dark: '#064e3b',
        },
        surface: {
          bg: '#f8fafc',
          card: '#ffffff',
          border: '#e2e8f0',
        },
        text: {
          primary: '#1e293b',
          secondary: '#64748b',
          muted: '#94a3b8',
        }
      },
    },
  },
  plugins: [],
}
