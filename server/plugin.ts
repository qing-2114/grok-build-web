import type { Plugin } from 'vite'
import { GrokAcp } from './acp.ts'
import { createRouter } from './http.ts'

const acp = new GrokAcp()

export function grokAcpPlugin(): Plugin {
  return {
    name: 'grok-acp',
    configureServer(server) {
      void acp.start().catch(() => undefined)
      server.middlewares.use(createRouter(acp))
      const stop = () => acp.stop()
      server.httpServer?.once('close', stop)
    },
    configurePreviewServer(server) {
      void acp.start().catch(() => undefined)
      server.middlewares.use(createRouter(acp))
      const stop = () => acp.stop()
      server.httpServer?.once('close', stop)
    },
  }
}
