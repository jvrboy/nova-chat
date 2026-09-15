import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Served from the Cloudflare Pages project under /app/ so the SPA shares an
  // origin with the /api backend (no CORS).
  base: '/app/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Local dev: forward API calls to the deployed backend (or a local wrangler dev server).
      '/api': {
        target: process.env.VITE_API_ORIGIN || 'https://webapp-9ek.pages.dev',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
})
