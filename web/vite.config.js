import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// /api is proxied to the Node server, so the browser and the API share an
// origin in development and the session cookie works without extra setup.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
})
