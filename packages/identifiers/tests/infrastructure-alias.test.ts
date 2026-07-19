// tests/infrastructure-alias.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { _resetAllChannels, getAliasPlugins } from '../src/channels/index.js'

// ─── Mock @kerith/core ─────────────────────────────────────────────────────────
// getFileCallerInfo() uses a real stack trace — in tests the call depth differs.
// We mock it to return a predictable filePath so our assertions stay stable.
vi.mock('@kerith/core', () => ({
  getFileCallerInfo: (_name: string) => ({ filePath: '/mock/test-file.ts' }),
}))

// Identifiers must be imported AFTER the mock is in place.
const { Client } = await import('../src/infrastructure/client.js')
const { Config } = await import('../src/infrastructure/config.js')
const { Provider } = await import('../src/infrastructure/provider.js')
const { Store } = await import('../src/infrastructure/store.js')
const { Adapter } = await import('../src/infrastructure/adapter.js')

beforeEach(() => {
  _resetAllChannels()
})

// ─── Client ───────────────────────────────────────────────────────────────────
describe('Client()', () => {
  it('registers an alias plugin with prefix "client"', () => {
    Client('redis', () => ({}))
    const plugins = getAliasPlugins()
    expect(plugins).toHaveLength(1)
    expect(plugins[0].prefix).toBe('client')
    expect(plugins[0].name).toBe('redis')
  })

  it('stores the provided factory as resolve', () => {
    const factory = () => ({ connected: true })
    Client('pg', factory)
    expect(getAliasPlugins()[0].resolve).toBe(factory)
  })

  it('records the filePath returned by getFileCallerInfo', () => {
    Client('http', () => ({}))
    expect(getAliasPlugins()[0].filePath).toBe('/mock/test-file.ts')
  })

  it('registers multiple calls independently', () => {
    Client('redis', () => ({}))
    Client('pg', () => ({}))
    expect(getAliasPlugins()).toHaveLength(2)
  })

  it('accepts an optional third argument without throwing', () => {
    expect(() => Client('redis', () => ({}), { lazy: true, required: false })).not.toThrow()
  })
})

// ─── Config ───────────────────────────────────────────────────────────────────
describe('Config()', () => {
  it('registers an alias plugin with prefix "config"', () => {
    Config('database', () => ({ host: 'localhost' }))
    const plugins = getAliasPlugins()
    expect(plugins[0].prefix).toBe('config')
    expect(plugins[0].name).toBe('database')
  })
})

// ─── Provider ─────────────────────────────────────────────────────────────────
describe('Provider()', () => {
  it('registers an alias plugin with prefix "provider"', () => {
    Provider('email', () => ({}))
    expect(getAliasPlugins()[0].prefix).toBe('provider')
    expect(getAliasPlugins()[0].name).toBe('email')
  })
})

// ─── Store ────────────────────────────────────────────────────────────────────
describe('Store()', () => {
  it('registers an alias plugin with prefix "store"', () => {
    Store('session', () => ({}))
    expect(getAliasPlugins()[0].prefix).toBe('store')
    expect(getAliasPlugins()[0].name).toBe('session')
  })
})

// ─── Adapter ──────────────────────────────────────────────────────────────────
describe('Adapter()', () => {
  it('registers an alias plugin with prefix "adapter"', () => {
    Adapter('payments', () => ({}))
    expect(getAliasPlugins()[0].prefix).toBe('adapter')
    expect(getAliasPlugins()[0].name).toBe('payments')
  })

  it('accepts call without options (developer-guide style)', () => {
    expect(() => Adapter('stripe', () => ({}))).not.toThrow()
  })
})

// ─── Cross-identifier isolation ───────────────────────────────────────────────
describe('alias channel — cross-identifier isolation', () => {
  it('all 5 identifiers land in the same alias store, each with its own prefix', () => {
    Client('c', () => ({}))
    Config('cfg', () => ({}))
    Provider('p', () => ({}))
    Store('s', () => ({}))
    Adapter('a', () => ({}))

    const plugins = getAliasPlugins()
    expect(plugins).toHaveLength(5)

    const prefixes = plugins.map((p) => p.prefix)
    expect(prefixes).toEqual(
      expect.arrayContaining(['client', 'config', 'provider', 'store', 'adapter']),
    )
  })
})

// ─── Checklist §1.4 — Specified contract tests ────────────────────────────────

describe('§1.4 — AliasPlugin full shape', () => {
  it('Client("db", factory) registers a plugin with the correct prefix, name, filePath, and resolve reference', () => {
    const factory = () => ({ connection: 'active' })
    Client('db', factory)

    const plugins = getAliasPlugins()
    expect(plugins).toHaveLength(1)

    const plugin = plugins[0]
    expect(plugin.prefix).toBe('client')
    expect(plugin.name).toBe('db')
    // filePath is mocked to '/mock/test-file.ts' by the vi.mock at the top of the file
    expect(plugin.filePath).toBe('/mock/test-file.ts')
    // resolve must be the exact same function reference — no wrapping
    expect(plugin.resolve).toBe(factory)
  })
})

describe('§1.4 — same name, different prefix → two independent entries', () => {
  it('Client("database") + Store("database") both appear in getAliasPlugins() (no dedup at this layer)', () => {
    Client('database', () => ({ type: 'client' }))
    Store('database', () => ({ type: 'store' }))

    const plugins = getAliasPlugins()
    // registerAliasPlugin does not deduplicate — that is Core's responsibility
    expect(plugins).toHaveLength(2)

    const clientPlugin = plugins.find((p) => p.prefix === 'client')
    const storePlugin  = plugins.find((p) => p.prefix === 'store')

    expect(clientPlugin).toBeDefined()
    expect(storePlugin).toBeDefined()
    expect(clientPlugin!.name).toBe('database')
    expect(storePlugin!.name).toBe('database')
  })
})

describe('§1.4 — resolve() reference transparency', () => {
  it('calling resolve() returns exactly what the factory returns, with no wrapping', () => {
    const sentinel = { __id: 'sentinel-value', nested: { ok: true } }
    const factory = () => sentinel

    Config('app', factory)

    const plugin = getAliasPlugins()[0]
    // Sanity check: resolve is the same reference
    expect(plugin.resolve).toBe(factory)
    // Sanity check: invoking it returns the same object
    expect(plugin.resolve()).toBe(sentinel)
  })
})
