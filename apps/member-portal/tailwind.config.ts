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
      },
    },
  },
  plugins: [],
};
export default config;
