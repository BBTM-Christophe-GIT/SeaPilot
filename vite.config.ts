import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    maxWorkers: 4,
    pool: 'threads',
    setupFiles: './src/test/setup.ts',
    // The Planning cockpit renders a large day-by-day accessibility tree. Give
    // full-suite workers enough headroom when several jsdom files run together.
    testTimeout: 20_000,
  },
});
