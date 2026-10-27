import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // rutas relativas: el sitio funciona en la raíz del dominio o en cualquier subcarpeta (public_html/juego/)
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true }
    }
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 }
});
