import { defineConfig } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: [
      'remotion/**/__tests__/**/*.test.ts',
      'remotion/**/*.test.ts',
      'client/src/**/*.test.{ts,tsx}',
      'client/src/__tests__/**/*.{test,spec}.{ts,tsx}',
      'shared/**/*.test.ts',
      'shared/**/__tests__/**/*.test.ts',
      'server/**/*.test.ts',
      'server/**/__tests__/**/*.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
});
