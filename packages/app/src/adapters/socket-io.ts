// src/adapters/socket-io.ts
// Lazy-loaded adapter for Socket.io integration.
// Follows the same pattern as loadBullMQ() and loadNodeCron().

import { KerithError } from '@kerith/core'
import type { Server as HTTPServer } from 'http'

// Minimal local interfaces — no module-level dependency on socket.io.
// The real Socket.io Server/Namespace satisfy these at runtime.
interface SocketIONamespace {
  use(fn: (socket: unknown, next: (err?: Error) => void) => void): void
  on(event: string, handler: (...args: unknown[]) => void): void
}

interface SocketIOServer {
  of(nsp: string | RegExp): SocketIONamespace
  on(event: string, handler: (...args: unknown[]) => void): void
  use(fn: (socket: unknown, next: (err?: Error) => void) => void): void
}

export interface SocketIOTransport {
  bind(
    name: string,
    handler: (socket: unknown) => void,
    options?: Record<string, unknown>,
  ): void
  attach(server: HTTPServer): Promise<void>
}

// Module-level state: io starts detached; namespaces registered via bind()
// are queued until attach() wires them to the HTTP server.
let io: SocketIOServer | null = null
let pending: Array<{
  name: string
  handler: (socket: unknown) => void
  options: Record<string, unknown>
}> = []
let socketIOModule: { Server: new (server: HTTPServer) => SocketIOServer } | null = null

function resolveNamespace(server: SocketIOServer, options: Record<string, unknown>): SocketIOServer | SocketIONamespace {
  const namespace = (options as any)?.namespace
  if (namespace && typeof namespace === 'string' && namespace !== '/') {
    return server.of(namespace)
  }
  return server
}

export async function loadSocketIOTransport(): Promise<SocketIOTransport> {
  if (!socketIOModule) {
    try {
      // @ts-ignore — optional peer dep, runtime import guarded by catch
      socketIOModule = (await import('socket.io')) as { Server: new (server: HTTPServer) => SocketIOServer }
    } catch {
      throw new KerithError(
        'MISSING_PEER_DEPENDENCY',
        `Gateway identifier requires 'socket.io' to be installed.\nRun: pnpm add socket.io`,
      )
    }
  }

  return {
    bind(name, handler, options = {}) {
      if (io) {
        const nsp = resolveNamespace(io, options)
        const middleware = (options as any)?.middleware
        if (Array.isArray(middleware)) {
          for (const fn of middleware) nsp.use(fn)
        }
        nsp.on('connection', (socket: unknown) => { handler(socket) })
      } else {
        pending.push({ name, handler, options })
      }
    },
    async attach(server: HTTPServer) {
      if (io) return
      if (!socketIOModule) {
        throw new KerithError(
          'MISSING_PEER_DEPENDENCY',
          `Gateway identifier requires 'socket.io' to be installed.\nRun: pnpm add socket.io`,
        )
      }
      io = new socketIOModule.Server(server)
      for (const p of pending) {
        const nsp = resolveNamespace(io, p.options)
        const middleware = (p.options as any)?.middleware
        if (Array.isArray(middleware)) {
          for (const fn of middleware) nsp.use(fn)
        }
        nsp.on('connection', (socket: unknown) => { p.handler(socket) })
      }
      pending = []
    },
  }
}
