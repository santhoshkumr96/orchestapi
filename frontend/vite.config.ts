import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        timeout: 3_600_000, // 60 min for long-running SSE streams
        // Disable buffering for SSE streaming endpoints
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, req) => {
            if (req.url?.includes('/run/stream')) {
              _proxyReq.setHeader('Cache-Control', 'no-cache')
              _proxyReq.setHeader('Connection', 'keep-alive')
            }
          })
          proxy.on('proxyRes', (proxyRes, req) => {
            if (req.url?.includes('/run/stream')) {
              proxyRes.headers['cache-control'] = 'no-cache'
              proxyRes.headers['x-accel-buffering'] = 'no'
            }
          })
        },
      },
      '/actuator': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
