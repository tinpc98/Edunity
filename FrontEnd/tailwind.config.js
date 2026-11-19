/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        admin: {
          dark: '#0F766E',
          primary: '#0D9488',
          hover: '#0B746C',
          secondary: '#14B8A6',
          mintLight: '#99F6E4',
          mintSoft: '#CCFBF1',
          bg: '#F5FAF9',
          sidebar: '#F0F8F6',
          surface: '#FFFFFF',
          textPrimary: '#163B40',
          textBody: '#334155',
          textSecondary: '#64748B',
          border: '#D6E5E2',
          rowHover: '#E5F5F1',
        },
        teal: {
          50: '#F0FDFA',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0D9488',
          700: '#0F766E',
          800: '#115E59',
          900: '#134E4A',
          950: '#042F2E',
        },
        mint: {
          50: '#F0F8F6',
          100: '#E5F5F1',
          200: '#CCFBF1',
          300: '#99F6E4',
          400: '#5EEAD4',
          500: '#2DD4BF',
          600: '#0D9488',
          700: '#0F766E',
        },
      },
    },
  },
  plugins: [],
}