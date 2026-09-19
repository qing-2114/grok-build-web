import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { grokAcpPlugin } from './server/plugin.ts'

// 默认只绑回环；确需局域网访问时用 GROK_WEB_HOST 显式覆盖（并把该主机加进 GROK_WEB_ALLOWED_HOSTS）
const host = process.env.GROK_WEB_HOST || '127.0.0.1'

export default defineConfig({
  plugins: [react(), grokAcpPlugin()],
  server: {
    port: 5173,
    host,
    cors: false,
  },
  preview: {
    port: 5173,
    host,
    cors: false,
  },
})
