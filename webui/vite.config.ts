import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = process.env.MYTHGRAM_BACKEND_URL || 'http://127.0.0.1:1000';
const devPort = Number(process.env.PORT || 2000);

const proxy = {
  '/api': {
    target: backendTarget,
    changeOrigin: true,
    ws: true,
  },
};

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-dom/client'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: devPort,
    strictPort: true,
    allowedHosts: true,
    proxy,
  },
  preview: {
    host: '0.0.0.0',
    port: devPort,
    strictPort: true,
    proxy,
  },
});
