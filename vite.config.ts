import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  base: loadEnv(mode, '.', 'VERCEL').VERCEL ? '/' : '/draw/',
  resolve: {
    alias: [
      {
        find: 'frappe-ui/src',
        replacement: new URL(
          './node_modules/frappe-ui/src',
          import.meta.url,
        ).pathname,
      },
      {
        find: /^frappe-ui$/,
        replacement: new URL(
          './node_modules/frappe-ui/src/components/Button/index.ts',
          import.meta.url,
        ).pathname,
      },
    ],
  },
  optimizeDeps: {
    include: ['feather-icons', 'debug'],
  },
  server: {
    host: true,
    allowedHosts: ['draw.local'],
    port: 8082,
    strictPort: true,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/desk': 'http://draw.local:8001',
      '/app': 'http://draw.local:8001',
      '/login': 'http://draw.local:8001',
      '/api': 'http://draw.local:8001',
      '/assets': 'http://draw.local:8001',
      '/files': 'http://draw.local:8001',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}))
