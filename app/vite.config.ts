import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'vendor-react';
          }
          if (id.includes('/lucide-react/')) {
            return 'vendor-icons';
          }
          if (
            id.includes('/recharts/') ||
            id.includes('/recharts-scale/') ||
            id.includes('/react-smooth/') ||
            id.includes('/d3-') ||
            id.includes('/victory-vendor/') ||
            id.includes('/decimal.js-light/') ||
            id.includes('/lodash/') ||
            id.includes('/eventemitter3/') ||
            id.includes('/fast-equals/') ||
            id.includes('/tiny-invariant/')
          ) {
            return 'vendor-charts';
          }
        },
      },
    },
  },
});
