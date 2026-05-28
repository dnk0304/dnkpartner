import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  // Build all emitted asset URLs under /studio/ so the dnkpartner Next.js
  // rewrite (/studio/:path* → studio:3100/:path*) round-trips them back to
  // the Express SPA-serve which mounts express.static at /studio. Dev uses
  // the Vite dev server directly at / so the base only matters for `vite build`.
  base: '/studio/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/downloads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/kdp-assets': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

