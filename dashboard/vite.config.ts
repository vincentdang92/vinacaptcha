import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3069,
    proxy: {
      '/admin/v1': {
        target: 'http://127.0.0.1:3068',
        changeOrigin: true,
      },
      '/v1': {
        target: 'http://127.0.0.1:3068',
        changeOrigin: true,
      },
    },
  },
})
