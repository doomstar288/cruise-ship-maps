import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Test configuration is kept separate from vite.config.js so the app build
// config stays minimal. Vitest prefers this file when both are present.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // Build scripts are covered too — the published API packs are a contract
    // with external consumers, so their shape needs the same guard as the app.
    include: ['src/**/*.{test,spec}.{js,jsx}', 'scripts/**/*.test.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.{test,spec}.{js,jsx}', 'src/test/**', 'src/main.jsx'],
    },
  },
});
