import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { grokAcpPlugin } from './server/plugin.ts'

export default defineConfig({
  plugins: [react(), grokAcpPlugin()],
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 5173,
    host: true,
  },
})
