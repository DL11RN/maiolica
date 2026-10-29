import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.MAIOLICA_API ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  // Il tavolo 3D (three.js) è caricato a parte e solo quando serve, ma resta grande per natura.
  build: { chunkSizeWarningLimit: 1500 },
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/socket.io': { target: api, ws: true },
    },
  },
});
