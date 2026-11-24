import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the browser talks to Vite (port 5173) and Vite forwards /api to your backend,
// so there is no CORS problem and the front end never needs to know the backend address.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_BACKEND || 'http://localhost:5000', changeOrigin: true } },
  },
});
