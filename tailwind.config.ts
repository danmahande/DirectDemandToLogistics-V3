import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563eb',
          dark: '#1d4ed8',
        },
        purple: '#8b5cf6',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#3b82f6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0,0,0,0.04)',
        'md': '0 4px 16px rgba(0,0,0,0.1)',
        'lg': '0 12px 48px rgba(0,0,0,0.15)',
        'float': '0 8px 32px rgba(37,99,235,0.2)',
      },
      animation: {
        'toast-in': 'toastIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        toastIn: {
          from: { opacity: '0', transform: 'translateX(20px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
export default config