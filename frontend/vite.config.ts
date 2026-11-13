import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
  },
  build: {
    outDir: resolve(import.meta.dirname, '../assets'),
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/main.tsx'),
      name: 'RedmineTaskFlow',
      formats: ['iife'],
      fileName: () => 'javascripts/task_flow.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'stylesheets/task_flow.css';
          }
          return 'images/[name][extname]';
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
}));
