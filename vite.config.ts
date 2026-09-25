import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  base: loadEnv(mode, '.', 'VERCEL').VERCEL ? '/' : '/draw/',
  resolve: {
    alias: [
      {
        find: '~icons/lucide/chevron-down',
        replacement: new URL('./src/assets/lucide-chevron-down.ts', import.meta.url).pathname,
      },
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
      '/desk': { target: 'http://127.0.0.1:8001', headers: { Host: 'draw.local' } },
      '/app': { target: 'http://127.0.0.1:8001', headers: { Host: 'draw.local' } },
      '/login': { target: 'http://127.0.0.1:8001', headers: { Host: 'draw.local' } },
      '/api': { target: 'http://127.0.0.1:8001', headers: { Host: 'draw.local' } },
      '/assets': { target: 'http://127.0.0.1:8001', headers: { Host: 'draw.local' } },
      '/files': { target: 'http://127.0.0.1:8001', headers: { Host: 'draw.local' } },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}))
