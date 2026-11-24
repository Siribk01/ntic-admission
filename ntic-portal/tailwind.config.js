/** @type {import('tailwindcss').Config} */
// NTIC colours, taken from the NTIC website. Change a value here and the whole portal follows.
// (Vite does not reload this file while it runs: stop and start `npm run dev` after editing it.)
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#0028c2', dark: '#001f9a', light: '#e8ecfb' }, // royal blue: buttons, links, focus
        navy: { DEFAULT: '#241080', dark: '#160a52' },                    // "NTIC Purple" and "Dark Purple": panels and headings
        gold: '#f2c94c',                                                  // "Accent Gold": small highlights only
        surface: '#f7f7fa',                                               // "Light Background"
        ink: '#222222',                                                   // "Main Text"
        muted: '#666666',                                                 // "Secondary Text"
      },
    },
  },
  plugins: [],
};
