import { Gateway } from '@kerith/app'
import type { Socket } from 'socket.io'

/**
 * Chat gateway — validates the bridge in kerith.listen().
 * A real socket.io-client connects and emits 'ping'; the server responds 'pong'.
 */
Gateway('chat', (socket: unknown) => {
  const s = socket as Socket
  s.on('ping', (msg: string) => {
    s.emit('pong', `echo:${msg}`)
  })
}, { namespace: '/' })
