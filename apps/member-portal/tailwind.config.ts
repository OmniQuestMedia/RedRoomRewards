import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'red-desire': '#C0392B',
        'red-passion': '#E74C3C',
        'red-obsession': '#922B21',
        'red-reign': '#641E16',
        aubergine: {
          DEFAULT: '#8B0000',
          bright: '#B33A3A',
          deep: '#5C0000',
        },
        slate: {
          100: '#F4F5F7',
          500: '#7B8794',
          700: '#52606D',
          900: '#1F2933',
        },
        champagne: {
          DEFAULT: '#C9A86A',
          soft: '#FAE5B8',
          deep: '#8B6914',
        },
        accent: {
          crimson: '#FF2D55',
          violet: '#7C3AED',
          teal: '#14B8A6',
          revenue: '#FF6B35',
        },
      },
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
