import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy all /api requests to Express backend
      '/api': {
        target: 'http://localhost:5000', // Your Express server
        changeOrigin: true,
        secure: false, // If using HTTPS backend
      },
    },
  },
});
