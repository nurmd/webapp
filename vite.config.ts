import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  define: {
    global: 'globalThis',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      events: 'events',
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0', // Accessible on local network/phone browser
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (
              id.includes('pouchdb') ||
              id.includes('/events/') ||
              id.includes('/spark-md5/') ||
              id.includes('/vuvuzela/') ||
              id.includes('/uuid/')
            ) {
              return 'vendor-pouchdb';
            }
            if (id.includes('/lucide-react/')) {
              return 'vendor-icons';
            }
          }
        },
      },
    },
  },
});
