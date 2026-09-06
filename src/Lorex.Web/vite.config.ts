import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = process.env.LOREX_API_URL ?? 'http://localhost:5180'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Keeps the browser on a single origin in development, so no CORS round trips.
      '/api': { target: apiTarget, changeOrigin: true },
      '/health': { target: apiTarget, changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
