import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      events: 'events',
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    testTimeout: 15000,
    hookTimeout: 15000,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      all: true,
      reporter: ['text-summary', 'text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        'scripts/',
        'android/',
        'android-native/',
        'public/',
        'src/__tests__/**',
        '**/*.test.*',
        '**/*.spec.*',
        '**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
});
