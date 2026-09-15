import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the built SPA works under a GitHub Pages project subpath as well as at domain root
  base: './',
  plugins: [react()],
  server: {
    port: 8766,
    strictPort: true,
    host: true,
    open: false,
  },
});
