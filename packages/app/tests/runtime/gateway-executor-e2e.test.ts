import { describe, it, expect, vi, afterEach } from 'vitest'
import { createServer } from 'node:http'
import express from 'express'
import { createApp } from '../../src/index.js'

describe('Gateway Executor E2E', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('connects real socket.io-client and executes handler', async () => {
    // Skip test if socket.io is not installed
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - socket.io is an optional peer dependency
      await import('socket.io')
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - socket.io-client is an optional peer dependency
      await import('socket.io-client')
    } catch {
      // Skip test gracefully if dependencies are missing
      return
    }

    const handlerExecuted = vi.fn()
    let receivedSocket: any = null

    // Import Gateway after dependencies are confirmed
    const { Gateway } = await import('@kerith/identifiers')

    // Declare Gateway
    Gateway('chat', (socket: any) => {
      handlerExecuted()
      receivedSocket = socket
      socket.on('message', (data: any) => {
        socket.emit('message-reply', { received: data })
      })
    }, { namespace: '/chat' })

    // Create Express app and server
    const app = express()
    const httpServer = createServer(app)

    // Boot Kerith app
    const kerithApp = await createApp(app as any)

    // Listen to attach Socket.io
    await kerithApp.listen(httpServer)

    // Start server on random port
    const port = 0 // Let OS assign random port
    await new Promise<void>(resolve => httpServer.listen(port, resolve))

    const serverPort = (httpServer.address() as any).port

    try {
      // Connect real socket.io-client
      // @ts-expect-error - socket.io-client is an optional peer dependency
      const { io } = await import('socket.io-client')
      const client = io(`http://localhost:${serverPort}/chat`)

      // Wait for connection
      await new Promise<void>((resolve) => {
        client.on('connect', () => resolve())
      })

      // Verify handler was executed
      expect(handlerExecuted).toHaveBeenCalled()
      expect(receivedSocket).toBeTruthy()

      // Test bidirectional communication
      const messagePromise = new Promise<any>((resolve) => {
        client.on('message-reply', (data: any) => resolve(data))
      })

      client.emit('message', { text: 'hello' })

      const reply = await messagePromise
      expect(reply).toEqual({ received: { text: 'hello' } })

      // Cleanup
      client.disconnect()
    } finally {
      // Cleanup server
      httpServer.close()
    }
  })
})
