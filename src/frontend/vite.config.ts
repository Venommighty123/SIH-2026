import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // maplibre-gl and recharts are inherently large; the bundler already splits
    // them out via the route-level dynamic imports in App.tsx.
    chunkSizeWarningLimit: 1400,
  },
});
