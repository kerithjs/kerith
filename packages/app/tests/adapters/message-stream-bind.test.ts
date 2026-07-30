// tests/adapters/message-stream-bind.test.ts
//
// Integration tests for the bind() lifecycle of Message and Stream transports.
// Uses a controlled-promise mock — no real Redis required, no OOM risk.
//
// The key challenge: bind() starts a background async loop using `void (async () => {})()`.
// If the mock's xreadgroup/xread resolves instantly (null), the loop spins at maximum speed
// and causes OOM. We use a "controlled promise" that only resolves when the test explicitly
// unblocks it — giving us full control over the loop lifecycle.

import { describe, it, expect, vi, afterEach } from 'vitest'

afterEach(() => {
  vi.doUnmock('ioredis')
  vi.resetModules()
})

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a mock IORedis client whose blocking calls (xreadgroup, xread) wait
 * indefinitely until the test calls `unblock()`. This prevents tight-loop OOM.
 *
 *  1. Loop starts and calls xreadgroup/xread → awaits the controlled promise
 *  2. Test calls `cleanup()` → sets `running = false`
 *  3. Test calls `unblock()` → resolves the awaited promise with null
 *  4. Loop sees null, does `continue`, re-checks `while (running)` → false → exits cleanly
 */
function makeControlledClient() {
  let resolveBlock!: (value: null) => void
  const blockPromise: Promise<null> = new Promise(resolve => {
    resolveBlock = resolve
  })

  // Must be a real class — vi.fn(() => obj) cannot be used with `new`.
  const xgroup     = vi.fn().mockResolvedValue('OK')
  const xreadgroup = vi.fn().mockReturnValue(blockPromise)
  const xread      = vi.fn().mockReturnValue(blockPromise)
  const xack       = vi.fn().mockResolvedValue(1)
  const quit       = vi.fn().mockResolvedValue('OK')

  class MockIORedis {
    xgroup     = xgroup
    xreadgroup = xreadgroup
    xread      = xread
    xack       = xack
    quit       = quit
  }

  return {
    MockClass: MockIORedis,
    unblock: () => resolveBlock(null),
    // Expose the fns so tests can make assertions on them
    fns: { xgroup, xreadgroup, xread, xack, quit },
  }
}

/** Tick: give the event loop a chance to enter the async IIFE and await. */
const tick = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms))

// ── Message transport ─────────────────────────────────────────────────────────

describe('MessageTransport.bind()', () => {
  it('returns a cleanup function (typeof === "function")', async () => {
    const { MockClass, unblock } = makeControlledClient()
    vi.doMock('ioredis', () => ({ default: MockClass }))

    const { loadMessageTransport } = await import('../../src/adapters/message.js')
    const transport = await loadMessageTransport()

    const cleanup = transport.bind('msg-stream-1', vi.fn())

    await tick() // let the IIFE start and block on xreadgroup

    expect(typeof cleanup).toBe('function')

    // Teardown: stop the loop cleanly so no dangling promises remain
    cleanup()  // running = false
    unblock()  // resolve the pending xreadgroup → null → loop exits
    await tick(20)
  })

  it('invokes the handler when xreadgroup returns an entry', async () => {
    const entryId = '1234-0'
    const entryFields = ['field', 'value']
    const fakeResult = [['test-msg-invoke', [[entryId, entryFields]]]]

    let callCount = 0
    let resolveFirst!: (v: any) => void
    let resolveSecond!: (v: null) => void

    // First call: return one entry. Second call: block indefinitely.
    const firstResult = new Promise<any>(res => { resolveFirst = res })
    const secondBlock = new Promise<null>(res => { resolveSecond = res })

    const client = {
      xgroup:     vi.fn().mockResolvedValue('OK'),
      xreadgroup: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? firstResult : secondBlock
      }),
      xack: vi.fn().mockResolvedValue(1),
      quit: vi.fn().mockResolvedValue('OK'),
    }

    class MockClient {
      xgroup = client.xgroup
      xreadgroup = client.xreadgroup
      xack = client.xack
      quit = client.quit
    }

    vi.doMock('ioredis', () => ({ default: MockClient }))

    const { loadMessageTransport } = await import('../../src/adapters/message.js')
    const transport = await loadMessageTransport()
    const handler = vi.fn()

    const cleanup = transport.bind('test-msg-invoke', handler)
    await tick()            // loop starts and awaits firstResult
    resolveFirst(fakeResult) // unblock: loop processes the entry, calls handler
    await tick(30)           // give time for handler and xack to run

    expect(handler).toHaveBeenCalledWith({ id: entryId, fields: entryFields })

    // Teardown
    cleanup()
    resolveSecond(null)
    await tick(20)
  })
})

// ── Stream transport ──────────────────────────────────────────────────────────

describe('StreamTransport.bind()', () => {
  it('returns a cleanup function (typeof === "function")', async () => {
    const { MockClass, unblock } = makeControlledClient()
    vi.doMock('ioredis', () => ({ default: MockClass }))

    const { loadStreamTransport } = await import('../../src/adapters/stream.js')
    const transport = await loadStreamTransport()

    const cleanup = transport.bind('str-stream-1', vi.fn())

    await tick()

    expect(typeof cleanup).toBe('function')

    cleanup()
    unblock()
    await tick(20)
  })

  it('invokes the handler when xread returns an entry', async () => {
    const entryId = '5678-0'
    const entryFields = ['key', 'val']
    const fakeResult = [['test-str-invoke', [[entryId, entryFields]]]]

    let callCount = 0
    let resolveFirst!: (v: any) => void
    let resolveSecond!: (v: null) => void

    const firstResult = new Promise<any>(res => { resolveFirst = res })
    const secondBlock = new Promise<null>(res => { resolveSecond = res })

    const client = {
      xread: vi.fn().mockImplementation(() => {
        callCount++
        return callCount === 1 ? firstResult : secondBlock
      }),
      xack: vi.fn().mockResolvedValue(1),
      quit: vi.fn().mockResolvedValue('OK'),
    }

    class MockClient {
      xread = client.xread
      xack = client.xack
      quit = client.quit
    }

    vi.doMock('ioredis', () => ({ default: MockClient }))

    const { loadStreamTransport } = await import('../../src/adapters/stream.js')
    const transport = await loadStreamTransport()
    const handler = vi.fn()

    const cleanup = transport.bind('test-str-invoke', handler)
    await tick()
    resolveFirst(fakeResult)
    await tick(30)

    expect(handler).toHaveBeenCalledWith({ id: entryId, fields: entryFields })

    cleanup()
    resolveSecond(null)
    await tick(20)
  })
})

// ── MISSING_PEER_DEPENDENCY ───────────────────────────────────────────────────

describe('loadIORedis — MISSING_PEER_DEPENDENCY', () => {
  it('throws MISSING_PEER_DEPENDENCY when ioredis is missing', async () => {
    vi.doMock('ioredis', () => { throw new Error('Cannot find module ioredis') })

    const { loadIORedis } = await import('../../src/adapters/redis-streams.js')

    await expect(loadIORedis()).rejects.toMatchObject({ code: 'MISSING_PEER_DEPENDENCY' })
  })
})
